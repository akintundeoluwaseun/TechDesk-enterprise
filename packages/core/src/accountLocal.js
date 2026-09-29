// The shop's own cloud account, WITHOUT a native host.
//
// A browser tab and an Android WebView are the same situation as they are
// for HQ: one JavaScript context, one origin, nowhere to hide a secret. So
// the auth request happens here and the session lives in accountStore.js,
// which is plain about what that does and does not mean.
//
// This is separate from hq.js/sync.js on purpose:
//
//   Connect to HQ   this shop reports up to an account that watches several.
//   Sync your data  two devices agree to work off each other's lists.
//   This account    the shop's own cloud copy of ITS OWN records, so a second
//                   device signed in to the same account sees the same shop.
//
// Signing in or out here never touches an HQ connection or a sync link --
// they are turned on and off independently, and a shop that signs out of its
// account has not asked to stop reporting to head office or syncing with the
// bench next door.

import { db } from "./db";
import { installId } from "./hqStore";
import { readState, readPublicState, saveState, clearState } from "./accountStore";

// Public by design, same as hq.js and sync.js: this only gets a request to
// the door. The database, behind Postgres row-level security, decides what a
// signed-in user's own token is allowed to read and write.
const SUPABASE_URL = "https://wuwerzyydtvargvqjufb.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_aiiQjedgBx4Tq-NX_jIGtw_ekAYgxV_";
// A pull is capped the same way a push batch is: a shop with months of
// history behind it should not have to hold one giant response in memory,
// and the caller already knows how to keep going while there is more.
const PULL_LIMIT = 400;

/** A message a shop owner can actually act on, not a raw Supabase error code. */
function friendlyAuthError(data) {
  const code = data?.error_code || data?.code || "";
  if (code === "user_already_exists" || code === "email_exists") {
    return "An account already exists for that email. Try signing in instead.";
  }
  if (code === "invalid_credentials") {
    return "That email and password don't match.";
  }
  if (code === "weak_password") {
    return "Choose a longer password -- at least 6 characters.";
  }
  // Supabase reports a wrong code and an expired one the same way, on
  // purpose -- telling them apart would tell an attacker which codes are
  // still live.
  if (code === "otp_expired" || code === "invalid_otp") {
    return "That code isn't right, or it has expired. Ask for a new one.";
  }
  return data?.msg || data?.error_description || data?.message || "Couldn't reach TechDesk. Check your details and try again.";
}

async function authFetch(path, body) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // No connection at all. Said plainly, because a shop on a dropped line
    // should not be left wondering whether it was their fault.
    return { ok: false, error: "offline", message: "Couldn't reach TechDesk. Check your internet and try again." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error_code || "auth_failed", message: friendlyAuthError(data) };
  return { ok: true, data };
}

/**
 * A signed-in session's access token expires (Supabase's default is an
 * hour) long before anyone signs out on purpose. Without this, every
 * authenticated request -- push, pull, inviting a worker -- starts failing
 * with "Invalid JWT" partway through the day, and the only way out looked
 * like signing out and back in. The refresh token is good for much longer,
 * so this trades it for a new pair and keeps everything else already
 * stored (role, workerName, businessId, pages) exactly as it was.
 */
async function refreshAccessToken() {
  const { signedIn, ...rest } = readState();
  void signedIn;
  if (!rest.refreshToken) return null;
  const res = await authFetch("/token?grant_type=refresh_token", { refresh_token: rest.refreshToken });
  if (!res.ok) return null;
  saveState({ ...rest, accessToken: res.data.access_token, refreshToken: res.data.refresh_token });
  return res.data.access_token;
}

/** A stale token reads as an HTTP 401, or an edge function's own "Invalid
 * JWT"/"JWT expired" message -- either way, worth one retry with a fresh
 * one before telling the shop something actually went wrong. */
function looksLikeExpiredJwt(res) {
  if (res?.error === "http_401") return true;
  return /jwt/i.test(res?.message || "");
}

/** PostgREST, called with the signed-in user's own token -- never a service
 * key. Only ever used from a browser build: on desktop this same request
 * happens in main.js, where the token lives. */
async function restFetch(path, { method = "GET", body, headers = {} } = {}) {
  const s = readState();
  if (!s.accessToken) return { ok: false, error: "not_signed_in" };

  async function attempt(token) {
    let res;
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
        method,
        headers: {
          apikey: PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      return { ok: false, error: "offline" };
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: `http_${res.status}`, message: data?.message };
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    return { ok: true, data };
  }

  let result = await attempt(s.accessToken);
  if (!result.ok && looksLikeExpiredJwt(result)) {
    const fresh = await refreshAccessToken();
    if (fresh) result = await attempt(fresh);
  }
  return result;
}

async function pushRows(rows) {
  // Best-effort: a shop's data still needs to go up even if this particular
  // device never manages to register itself in the devices list.
  await restFetch("/account_devices?on_conflict=account_id,install_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: [{ install_id: installId(), last_seen_at: new Date().toISOString() }],
  });
  return restFetch("/account_records?on_conflict=account_id,kind,record_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: rows,
  });
}

async function pullRows(sinceCursor) {
  // synced_at is stamped by the server when a row lands (migration 0032), so
  // the cursor means "arrived since I last looked". updated_at is the editing
  // device's clock: an edit made offline and uploaded later sat behind a
  // cursor that had already moved past it, and was never pulled.
  const parts = ["order=synced_at.asc", `limit=${PULL_LIMIT}`];
  if (sinceCursor) parts.push(`synced_at=gt.${encodeURIComponent(sinceCursor)}`);
  const res = await restFetch(`/account_records?${parts.join("&")}`);
  if (!res.ok) return res;
  return { ok: true, rows: res.data || [] };
}

/** A message a shop owner can actually act on, not a raw Edge Function error code. */
function friendlyInviteError(data) {
  const code = data?.error;
  if (code === "not_signed_in") return "Sign in first.";
  if (code === "rate_limited") return data?.message || "Too many attempts. Try again shortly.";
  if (code === "invalid_code") return "That code isn't right, or has expired. Ask for a new one.";
  if (code === "bad_request") return data?.message || "Check what you typed and try again.";
  return data?.message || "Couldn't reach TechDesk. Check your internet and try again.";
}

async function fnFetch(fn, body, { token } = {}) {
  async function attempt(tok) {
    let res;
    try {
      res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: "POST",
        headers: {
          apikey: PUBLISHABLE_KEY,
          Authorization: `Bearer ${tok || PUBLISHABLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, message: "Couldn't reach TechDesk. Check your internet and try again." };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) return { ok: false, message: friendlyInviteError(data) };
    return data;
  }

  let result = await attempt(token);
  if (!result.ok && token && looksLikeExpiredJwt(result)) {
    const fresh = await refreshAccessToken();
    if (fresh) result = await attempt(fresh);
  }
  return result;
}

export const accountLocal = {
  /** The web app can always try; there is no shell that might be missing. */
  available: () => true,

  /** Whether this device is signed in, and to whom. Never the token. */
  async status() {
    return readPublicState();
  },

  async signUp(email, password) {
    const trimmed = (email || "").trim();
    if (!trimmed || !password) return { ok: false, message: "Enter an email and a password." };

    const res = await authFetch("/signup", { email: trimmed, password });
    if (!res.ok) return res;
    if (!res.data.access_token) {
      // Email confirmation is required before there is a session to store.
      return { ok: true, needsConfirmation: true };
    }
    saveState({ email: trimmed, accessToken: res.data.access_token, refreshToken: res.data.refresh_token });
    return { ok: true };
  },

  async signIn(email, password) {
    const trimmed = (email || "").trim();
    if (!trimmed || !password) return { ok: false, message: "Enter an email and a password." };

    const res = await authFetch("/token?grant_type=password", { email: trimmed, password });
    if (!res.ok) return res;
    saveState({ email: trimmed, accessToken: res.data.access_token, refreshToken: res.data.refresh_token });
    return { ok: true };
  },

  /**
   * Finishes signUp() when a fresh account needs its email confirmed --
   * the code from that email, checked directly against Supabase's own
   * signup confirmation (the same thing a confirmation LINK would do,
   * just typed in rather than clicked, since a link has nowhere reliable
   * to send this device back to). A match hands back a real session, same
   * as signIn.
   */
  async confirmSignUp(email, code) {
    const trimmed = (email || "").trim();
    const trimmedCode = (code || "").trim();
    if (!trimmed || !trimmedCode) return { ok: false, message: "Enter the code from your email." };

    const res = await authFetch("/verify", { type: "signup", email: trimmed, token: trimmedCode });
    if (!res.ok) return res;
    saveState({ email: trimmed, accessToken: res.data.access_token, refreshToken: res.data.refresh_token });
    return { ok: true };
  },

  /**
   * Asks Supabase to email a recovery code to this address. Always answers
   * ok -- Supabase itself never says whether the address has an account,
   * on purpose, the same reason signUp() doesn't either, so there is
   * nothing truthful this could add by checking first.
   */
  async requestPasswordReset(email) {
    const trimmed = (email || "").trim();
    if (!trimmed) return { ok: false, message: "Enter the email your account uses." };

    const res = await authFetch("/recover", { email: trimmed });
    if (!res.ok) return res;
    return { ok: true };
  },

  /**
   * The other half: the code from that email, plus the new password.
   * Two calls under the hood -- verifying the code hands back a short-lived
   * recovery session, which is then the ONLY thing allowed to set the new
   * password, never the old one. Signs this device in as soon as it works,
   * same as a normal sign-in would.
   */
  async confirmPasswordReset(email, code, newPassword) {
    const trimmed = (email || "").trim();
    const trimmedCode = (code || "").trim();
    if (!trimmed || !trimmedCode || !newPassword) {
      return { ok: false, message: "Enter the code and a new password." };
    }

    const verified = await authFetch("/verify", { type: "recovery", email: trimmed, token: trimmedCode });
    if (!verified.ok) return verified;

    const recoveryToken = verified.data.access_token;
    let res;
    try {
      res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          apikey: PUBLISHABLE_KEY,
          Authorization: `Bearer ${recoveryToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: newPassword }),
      });
    } catch {
      return { ok: false, error: "offline", message: "Couldn't reach TechDesk. Check your internet and try again." };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error_code || "auth_failed", message: friendlyAuthError(data) };

    saveState({ email: trimmed, accessToken: recoveryToken, refreshToken: verified.data.refresh_token });
    return { ok: true };
  },

  /** Forgets the session on this device. The account itself is untouched. */
  async signOut() {
    clearState();
    return { ok: true };
  },

  /**
   * Sends everything changed since `sinceCursor`. The cursor moves only on a
   * confirmed success, so a failed push is retried rather than skipped, and
   * it is always a time from this device's own clock -- the server's reply
   * would drift against it.
   */
  async push(sinceCursor) {
    const batch = db.getSyncBatch(sinceCursor);
    if (!batch.records.length) return { ok: true, sent: 0, more: false, cursor: sinceCursor };

    // account_id defaults to auth.uid() in Postgres, which is right for the
    // owner (their own uid IS the business) and wrong for a worker's device:
    // its uid is its own hidden identity, not the business it joined. A
    // worker's session always carries which business that is, so it is sent
    // explicitly rather than relied on to default correctly.
    const { businessId } = readState();
    const rows = batch.records.map((r) => ({
      ...(businessId ? { account_id: businessId } : {}),
      kind: r.kind,
      record_id: r.id,
      payload: r.deleted ? {} : r.payload,
      deleted: Boolean(r.deleted),
      updated_at: r.updatedAt,
    }));

    const res = await pushRows(rows);
    if (!res.ok) return { ok: false, error: res.error, sent: 0, more: batch.more, cursor: sinceCursor };
    return { ok: true, sent: rows.length, more: batch.more, cursor: batch.cursor };
  },

  /**
   * Pulls everything changed since `sinceCursor` and merges it straight into
   * local storage via db.applyIncoming. Returns how many rows actually
   * changed something, and whether there is more waiting behind the cap.
   */
  async pull(sinceCursor) {
    const res = await pullRows(sinceCursor);
    if (!res.ok) return res;

    const rows = res.rows || [];
    const records = rows.map((row) => ({
      id: row.record_id,
      kind: row.kind,
      updatedAt: row.updated_at,
      deleted: row.deleted,
      payload: row.payload,
    }));
    const { applied } = db.applyIncoming(records);
    return {
      ok: true,
      applied,
      more: rows.length >= PULL_LIMIT,
      cursor: rows.length ? rows[rows.length - 1].synced_at ?? rows[rows.length - 1].updated_at : sinceCursor,
    };
  },

  /**
   * Owner only: asks for a fresh code to read out to a worker, for exactly
   * the pages (sales/repairs/inventory) this worker is being granted. Requires
   * this device's own real session -- the Edge Function decides whose
   * business the code belongs to purely from that token, never from anything
   * in the request body -- but the pages DO come from the body, since that is
   * the one thing only the admin, right now, actually knows.
   */
  async inviteStart(pages) {
    const { accessToken } = readState();
    if (!accessToken) return { ok: false, message: "Sign in first." };
    if (!Array.isArray(pages) || !pages.length) {
      return { ok: false, message: "Pick at least one page for this worker." };
    }
    return fnFetch("account-invite-start", { pages }, { token: accessToken });
  },

  /**
   * A worker's device, joining with the shop's email, the code the owner
   * read out, and the worker's own name. On success this device holds its
   * own session from here on -- a real one, but for a hidden identity that
   * exists only to be this one worker on this one shop, never the shop's own
   * login. Which pages it may open (res.pages) was decided by the admin back
   * when the code was generated, not by anything typed here.
   */
  async workerJoin(email, code, name) {
    const trimmed = (email || "").trim();
    const trimmedName = (name || "").trim();
    if (!trimmed) return { ok: false, message: "Enter the shop's email." };
    if (!trimmedName) return { ok: false, message: "Enter your name." };

    const res = await fnFetch("account-invite-redeem", { email: trimmed, code, name: trimmedName });
    if (!res.ok) return res;

    saveState({
      email: null,
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      role: "worker",
      workerName: res.workerName,
      businessId: res.businessId,
      pages: res.pages,
    });
    return { ok: true, workerName: res.workerName };
  },

  /**
   * A worker's device asking whether it still belongs to the shop. Removing
   * a worker deletes their account_workers row; the session itself stays
   * valid, so nothing else ever tells the device -- sync just quietly stops.
   * Their own row is the only one row-level security lets them read: none
   * back means they were removed. Anything but a clean answer (offline, a
   * server error) is "don't know", never "removed".
   */
  async checkMembership() {
    const s = readState();
    if (!s.accessToken || s.role !== "worker") return { ok: true, member: true };
    const res = await restFetch("/account_workers?select=name,pages");
    if (!res.ok) return { ok: false };
    return { ok: true, member: Array.isArray(res.data) && res.data.length > 0 };
  },

  /**
   * Owner only: every worker currently connected to this account, newest
   * first, with the pages the admin granted each of them. Reads straight
   * from account_workers via PostgREST -- row-level security already scopes
   * this to the caller's own business, so there is nothing to filter here.
   */
  async listWorkers() {
    const res = await restFetch(
      "/account_workers?select=worker_user_id,name,pages,created_at&order=created_at.desc"
    );
    if (!res.ok) return res;
    return {
      ok: true,
      workers: (res.data || []).map((w) => ({
        id: w.worker_user_id,
        name: w.name,
        pages: w.pages,
        joinedAt: w.created_at,
      })),
    };
  },

  /**
   * Owner only: revokes one worker's membership. Their device loses read and
   * write on this business's records on its very next request -- every
   * policy on account_records/account_devices checks account_workers, not
   * just something decided once at sign-in -- even though the session token
   * itself, being a real Supabase Auth session, is not revoked by this and
   * keeps working as a login for nothing in particular.
   */
  async revokeWorker(workerId) {
    return restFetch(`/account_workers?worker_user_id=eq.${encodeURIComponent(workerId)}`, { method: "DELETE" });
  },
};
