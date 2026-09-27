// Talking to the TechDesk backend WITHOUT a native host.
//
// A browser tab and an Android WebView are the same situation: one JavaScript
// context, one origin, and nowhere to hide a token. So the posting happens
// here and the connection lives in hqStore.js, which is plain about what that
// does and does not mean.
//
// This is the implementation the Android app uses. Head office on a phone is
// not a port of the desktop's -- it is this, which already runs in the Web
// App, with the token fix that took a month to find still in it.
//
// Same three steps as the desktop app, and the shop owner's part in between is
// still a phone call:
//
//   1. connectStart(hqPhone)  -- a code is texted to HQ's phone
//   2. the manager rings HQ, who reads the code out
//   3. connectVerify(code)    -- the device is linked and gets its token
//
// The difference from the desktop build is where the token ends up. There, it
// goes to Electron's main process and the UI never sees it. A browser has no
// second process to hide it in, so it lives in this origin's localStorage --
// see hqStore.js, which says plainly what that does and does not mean. The
// posting therefore happens here rather than being handed off.

import { db } from "./db";
import {
  installId, readState, readPublicState, saveState, clearState,
  rememberRevoke, pendingRevoke, clearRevoke,
} from "./hqStore";

// Public by design. This gets a request to the door; the database decides what
// it is allowed through it. Nothing secret ships in the app.
const SUPABASE_URL = "https://wuwerzyydtvargvqjufb.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_aiiQjedgBx4Tq-NX_jIGtw_ekAYgxV_";

// What this device calls itself to HQ. Support information only: the server
// reads businesses.plan to decide whether to accept anything, and never this.
const EDITION = typeof window !== "undefined" && window.Capacitor ? "android" : "web";

/** The handle from connectStart, held only until verify. Never persisted. */
let pendingState = null;
// The provider's id for the code that was just sent. Handed back at verify so
// the check works even on a backend that has not stored it.
let pendingOtpId = null;
let pendingPhone = null;
let pendingEmail = null;

async function post(fn, body, token) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token || PUBLISHABLE_KEY}`,
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

export const hqLocal = {
  /** The web app can always try; there is no shell that might be missing. */
  available: () => true,

  /** Whether this device is connected, and to whom. Never the token. */
  async status() {
    return readPublicState();
  },

  /**
   * Step one. Sends a code to HQ -- an email, free, or a phone, which costs
   * real money to text -- and keeps the handle that proves this device
   * asked. Returns the masked identifier so the person can check they typed
   * it right before reaching out.
   */
  async connectStart({ hqPhone, hqEmail, branchName, businessName }) {
    const label = (branchName || "").trim();
    if (!label) return { ok: false, message: "Give this branch a name first." };

    const res = await post("connect-start", {
      installId: installId(),
      requesterRole: "manager",
      requesterLabel: label,
      targetPhone: hqEmail ? null : hqPhone,
      targetEmail: hqEmail || null,
      targetRole: "hq",
      branchName: label,
      businessName: businessName || null,
      edition: EDITION,
    });

    if (res.ok) {
      pendingState = res.state;
      pendingOtpId = res.otpId || null;
      pendingPhone = hqEmail ? null : hqPhone;
      pendingEmail = hqEmail || null;
    }
    return res;
  },

  /** Step two. The code HQ read out, or found in their email. */
  async connectVerify({ code, appVersion }) {
    if (!pendingState) {
      return { ok: false, message: "Ask for a new code first." };
    }

    const res = await post("connect-verify", {
      state: pendingState,
      otpId: pendingOtpId,
      installId: installId(),
      targetPhone: pendingPhone,
      targetEmail: pendingEmail,
      code,
      edition: EDITION,
      appVersion: appVersion || null,
    });

    if (!res.ok) return res;

    const saved = saveState({
      token: res.token,
      businessId: res.businessId,
      branchId: res.branchId,
      hqPhone: pendingPhone,
      hqEmail: pendingEmail,
      branchName: res.branchName || null,
    });
    // The handle is spent either way: it cannot be used twice, and keeping it
    // around only invites a confusing second attempt.
    pendingState = null;
    pendingOtpId = null;
    pendingPhone = null;
    pendingEmail = null;

    if (!saved.ok) {
      // The device IS linked at HQ but the token did not survive locally --
      // private browsing, or site data turned off. Saying "connected" here
      // would be a lie the shop discovers when nothing ever reaches HQ.
      return {
        ok: false,
        message:
          "Connected, but this browser wouldn't save it. Turn off private browsing, or allow site data, then connect again.",
      };
    }
    return { ok: true };
  },

  /**
   * Sends everything changed since the last successful sync.
   *
   * The cursor moves only on a confirmed success, so a failed push is retried
   * rather than skipped, and it is always a time from this device's own clock
   * -- the server's reply would drift against it.
   */
  async sync({ appVersion } = {}) {
    const state = readState();
    if (!state.connected) return { ok: false, error: "not_connected" };

    const batch = db.getSyncBatch(state.lastSyncAt);

    // An empty push is still worth making: it is how a branch says "still
    // here", and it is what keeps HQ's online dot honest.
    //
    // The device token goes in the BODY. sync-push reads body.token and
    // nothing else -- the Authorization header carries the publishable key
    // that gets the request through the gateway, which is a different thing
    // entirely. Sending it only as a bearer meant every push came back
    // "Missing token", so a browser could connect to HQ and then never
    // deliver a single sale.
    const res = await post("sync-push", {
      token: state.token,
      records: batch.records,
      edition: EDITION,
      appVersion: appVersion || null,
    }, state.token);

    if (!res?.ok) return { ...res, sent: 0, more: batch.more };

    if (batch.records.length) {
      saveState({ ...state, lastSyncAt: batch.cursor });
    }
    return { ok: true, sent: batch.records.length, more: batch.more };
  },

  /**
   * Leaves head office: here AND there.
   *
   * This used to forget the token and stop, so the server never heard about
   * it -- the device stayed active and Monitor went on listing a phone the
   * shop had deliberately disconnected.
   *
   * The local half always happens. A shop that taps Disconnect is finished
   * with the connection whatever the network is doing, and being told "no
   * internet, try again" when you are handing the phone over is useless. If
   * the server could not be told, the token is held back for that one errand
   * and retried; see flushRevoke().
   */
  async disconnect() {
    const state = readState();
    pendingState = null;
    pendingOtpId = null;
    pendingPhone = null;
    pendingEmail = null;

    let told = false;
    if (state.token) {
      const res = await post("connect-disconnect", { token: state.token }, state.token);
      told = Boolean(res?.ok);
      if (!told) rememberRevoke(state.token);
    }

    const cleared = clearState();
    return { ...cleared, told };
  },

  /**
   * Hands back a disconnect that could not be delivered at the time.
   *
   * Called on launch and when the network returns. Nothing depends on it
   * succeeding today: until it does, head office shows a device that is no
   * longer reporting, which is what it looked like before this existed.
   */
  async flushRevoke() {
    const owed = pendingRevoke();
    if (!owed) return { ok: true, pending: false };
    const res = await post("connect-disconnect", { token: owed.token }, owed.token);
    if (res?.ok) {
      clearRevoke();
      return { ok: true, pending: false, told: true };
    }
    return { ok: false, pending: true };
  },
};
