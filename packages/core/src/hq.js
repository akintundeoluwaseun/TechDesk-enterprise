// Talking to the TechDesk backend.
//
// Two calls, and the shop owner's part in between is a phone call:
//
//   1. connectStart(hqPhone)  -- a code is texted to HQ's phone
//   2. the manager rings HQ, who reads the code out
//   3. connectVerify(code)    -- the device is linked and gets its token
//
// The token never reaches this file's callers. It goes straight to the main
// process, which stores it in userData; the renderer only ever learns that a
// connection exists.

import { hostBridge, hasHostBridge } from "./bridge";
import { db } from "./db";

// Public by design. This gets a request to the door; the database decides what
// it is allowed through it. Nothing secret ships in the app.
const SUPABASE_URL = "https://wuwerzyydtvargvqjufb.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_aiiQjedgBx4Tq-NX_jIGtw_ekAYgxV_";

const EDITION = "enterprise";

/** The handle from connectStart, held only until verify. Never persisted. */
let pendingState = null;
// The provider's id for the code that was just sent. Handed back at verify so
// the check works even on a backend that has not stored it.
let pendingOtpId = null;
let pendingPhone = null;

async function post(fn, body) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PUBLISHABLE_KEY}`,
        "apikey": PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    // No connection at all. Said plainly, because a shop on a dropped line
    // should not be left wondering whether it was their fault.
    return { ok: false, error: "offline", message: "Couldn't reach TechDesk. Check your internet and try again." };
  }
  const data = await res.json().catch(() => ({}));
  if (data && typeof data.ok === "boolean") return data;
  return { ok: false, error: "server_error", message: "Something went wrong. Try again." };
}

export const hq = {
  available: () => hasHostBridge(),

  /** Whether this device is connected, and to whom. Never the token. */
  async status() {
    if (!hasHostBridge()) return { connected: false, installId: null };
    const res = await hostBridge().hqRead();
    return res?.ok ? res.state : { connected: false, installId: null };
  },

  /**
   * Step one. Texts a code to the HQ number and keeps the handle that proves
   * this device asked. Returns the masked number so the person can check they
   * typed it right before ringing anyone.
   */
  async connectStart({ hqPhone, branchName, businessName }) {
    if (!hasHostBridge()) {
      return { ok: false, message: "Connecting to HQ needs the installed desktop app." };
    }
    const id = await hostBridge().hqInstallId();
    if (!id?.ok) return { ok: false, message: "Couldn't identify this device." };

    const label = (branchName || "").trim();
    if (!label) return { ok: false, message: "Give this branch a name first." };

    const res = await post("connect-start", {
      installId: id.installId,
      requesterRole: "manager",
      requesterLabel: label,
      targetPhone: hqPhone,
      targetRole: "hq",
      branchName: label,
      businessName: businessName || null,
      edition: EDITION,
    });

    if (res.ok) {
      pendingState = res.state;
      pendingOtpId = res.otpId || null;
      pendingPhone = hqPhone;
    }
    return res;
  },

  /**
   * Step two. The code HQ read out. On success the token is handed straight to
   * the main process and this function returns only what the UI needs to show.
   */
  async connectVerify({ code, appVersion }) {
    if (!hasHostBridge()) {
      return { ok: false, message: "Connecting to HQ needs the installed desktop app." };
    }
    if (!pendingState) {
      return { ok: false, message: "Ask for a new code first." };
    }
    const id = await hostBridge().hqInstallId();
    if (!id?.ok) return { ok: false, message: "Couldn't identify this device." };

    const res = await post("connect-verify", {
      state: pendingState,
      otpId: pendingOtpId,
      installId: id.installId,
      targetPhone: pendingPhone,
      code,
      edition: EDITION,
      appVersion: appVersion || null,
    });

    if (!res.ok) return res;

    const saved = await hostBridge().hqSave({
      token: res.token,
      businessId: res.businessId,
      branchId: res.branchId,
      hqPhone: pendingPhone,
      branchName: res.branchName || null,
    });
    // The handle is spent either way: it cannot be used twice, and keeping it
    // around only invites a confusing second attempt.
    pendingState = null;
    pendingOtpId = null;
    pendingPhone = null;

    if (!saved?.ok) {
      // The device IS linked at HQ but the token did not survive locally.
      // Saying "connected" here would be a lie the shop discovers later.
      return {
        ok: false,
        message: "Connected, but this device couldn't save it. Try connecting again.",
      };
    }
    return { ok: true };
  },

  /**
   * Sends everything changed since the last successful sync.
   *
   * The token never comes back here -- the main process holds it and does the
   * posting. This decides WHAT to send and moves the cursor only on a
   * confirmed success, so a failed push is retried rather than skipped.
   */
  async sync({ appVersion } = {}) {
    if (!hasHostBridge()) return { ok: false, error: "not_desktop" };

    const state = await this.status();
    if (!state?.connected) return { ok: false, error: "not_connected" };

    const batch = db.getSyncBatch(state.lastSyncAt);

    // An empty push is still worth making: it is how a branch says "still
    // here", and it is what keeps HQ's online dot honest. The cursor does not
    // move, because nothing was sent.
    const res = await hostBridge().hqSync({
      url: SUPABASE_URL,
      key: PUBLISHABLE_KEY,
      records: batch.records,
      // Moved only on a confirmed success, and only to a time from this
      // device's own clock -- the server's reply would drift against it.
      cursor: batch.records.length ? batch.cursor : null,
    });
    if (!res?.ok) return { ...res, sent: 0, more: batch.more };
    return { ok: true, sent: batch.records.length, more: batch.more, appVersion };
  },

  /** Forgets the connection locally. The install id survives. */
  async disconnect() {
    if (!hasHostBridge()) return { ok: false };
    pendingState = null;
    pendingOtpId = null;
    pendingPhone = null;
    return await hostBridge().hqDisconnect();
  },
};
