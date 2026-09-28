// The shop's own cloud account, THROUGH A NATIVE HOST.
//
// Electron only, mirroring hqBridge.js exactly: the renderer asks the main
// process to sign in and never sees the password or the session token. Where
// there is no host to ask -- a browser tab, an Android WebView --
// accountLocal.js does the same job in the open, and account.js picks
// between them.

import { hostBridge, hasHostBridge } from "./bridge";
import { db } from "./db";

// Public by design, same as hqBridge.js: this only gets a request to the
// door; the database, behind row-level security, decides what the signed-in
// user's own token is allowed to read and write.
const SUPABASE_URL = "https://wuwerzyydtvargvqjufb.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_aiiQjedgBx4Tq-NX_jIGtw_ekAYgxV_";

export const accountBridge = {
  available: () => hasHostBridge(),

  /** Whether this device is signed in, and to whom. Never the token. */
  async status() {
    if (!hasHostBridge()) return { signedIn: false, email: null };
    const res = await hostBridge().accountRead();
    return res?.ok ? res.state : { signedIn: false, email: null };
  },

  async signUp(email, password) {
    if (!hasHostBridge()) return { ok: false, message: "This needs the installed desktop app." };
    const trimmed = (email || "").trim();
    if (!trimmed || !password) return { ok: false, message: "Enter an email and a password." };
    return hostBridge().accountSignUp({ url: SUPABASE_URL, key: PUBLISHABLE_KEY, email: trimmed, password });
  },

  async signIn(email, password) {
    if (!hasHostBridge()) return { ok: false, message: "This needs the installed desktop app." };
    const trimmed = (email || "").trim();
    if (!trimmed || !password) return { ok: false, message: "Enter an email and a password." };
    return hostBridge().accountSignIn({ url: SUPABASE_URL, key: PUBLISHABLE_KEY, email: trimmed, password });
  },

  /** Finishes signUp() when a fresh account needs its email confirmed. Same
   * reasoning as accountLocal: a code typed in here, not a link clicked,
   * because this device has nowhere reliable for a link to send it back to. */
  async confirmSignUp(email, code) {
    if (!hasHostBridge()) return { ok: false, message: "This needs the installed desktop app." };
    return hostBridge().accountConfirmSignUp({ url: SUPABASE_URL, key: PUBLISHABLE_KEY, email, code });
  },

  /** Asks Supabase to email a recovery code. Always answers ok -- whether
   * the address has an account is not this device's to say. */
  async requestPasswordReset(email) {
    if (!hasHostBridge()) return { ok: false, message: "This needs the installed desktop app." };
    return hostBridge().accountRequestPasswordReset({ url: SUPABASE_URL, key: PUBLISHABLE_KEY, email });
  },

  /** The code from that email, plus the new password. Signs this device in
   * the moment it works, same as a normal sign-in. */
  async confirmPasswordReset(email, code, newPassword) {
    if (!hasHostBridge()) return { ok: false, message: "This needs the installed desktop app." };
    return hostBridge().accountConfirmPasswordReset({ url: SUPABASE_URL, key: PUBLISHABLE_KEY, email, code, newPassword });
  },

  /** Forgets the session in the main process. The account itself is untouched.
   * No server call: unlike hq's disconnect, signing out of a password
   * session has nothing for the server to be told. */
  async signOut() {
    if (!hasHostBridge()) return { ok: true };
    return hostBridge().accountSignOut();
  },

  /**
   * Sends everything changed since `sinceCursor`. The token never comes back
   * here -- the main process holds it and does the posting. This decides
   * WHAT to send and moves the cursor only on a confirmed success.
   */
  async push(sinceCursor) {
    if (!hasHostBridge()) return { ok: false, error: "not_desktop", sent: 0, more: false, cursor: sinceCursor };

    const batch = db.getSyncBatch(sinceCursor);
    if (!batch.records.length) return { ok: true, sent: 0, more: false, cursor: sinceCursor };

    const rows = batch.records.map((r) => ({
      kind: r.kind,
      record_id: r.id,
      payload: r.deleted ? {} : r.payload,
      deleted: Boolean(r.deleted),
      updated_at: r.updatedAt,
    }));

    const res = await hostBridge().accountPush({ url: SUPABASE_URL, key: PUBLISHABLE_KEY, rows });
    if (!res?.ok) return { ok: false, error: res?.error, sent: 0, more: batch.more, cursor: sinceCursor };
    return { ok: true, sent: rows.length, more: batch.more, cursor: batch.cursor };
  },

  /**
   * Pulls everything changed since `sinceCursor`. The main process fetches
   * the rows; merging them into local storage happens here, same as
   * accountLocal, because that part needs db and has nothing to do with
   * where the token lives.
   */
  async pull(sinceCursor) {
    if (!hasHostBridge()) return { ok: false, error: "not_desktop" };
    const res = await hostBridge().accountPull({ url: SUPABASE_URL, key: PUBLISHABLE_KEY, sinceCursor });
    if (!res?.ok) return res || { ok: false, error: "not_desktop" };

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
      more: Boolean(res.more),
      cursor: rows.length ? rows[rows.length - 1].updated_at : sinceCursor,
    };
  },

  /** Owner only: asks the main process for a fresh code to read out to a
   * worker, for exactly the pages (sales/repairs/inventory) this worker is
   * being granted. The main process holds the real session and calls the
   * Edge Function with it; nothing here ever sees the token. */
  async inviteStart(pages) {
    if (!hasHostBridge()) return { ok: false, message: "This needs the installed desktop app." };
    if (!Array.isArray(pages) || !pages.length) {
      return { ok: false, message: "Pick at least one page for this worker." };
    }
    return hostBridge().accountInviteStart({ url: SUPABASE_URL, key: PUBLISHABLE_KEY, pages });
  },

  /** A worker's device, joining with the shop's email, the code the owner
   * read out, and the worker's own name. The resulting session is stored in
   * the main process, same as a normal sign-in. */
  async workerJoin(email, code, name) {
    if (!hasHostBridge()) return { ok: false, message: "This needs the installed desktop app." };
    return hostBridge().accountInviteRedeem({ url: SUPABASE_URL, key: PUBLISHABLE_KEY, email, code, name });
  },

  /** Owner only: every worker currently connected to this account, from the
   * main process, which holds the real session. */
  async listWorkers() {
    if (!hasHostBridge()) return { ok: false, message: "This needs the installed desktop app." };
    return hostBridge().accountWorkersList({ url: SUPABASE_URL, key: PUBLISHABLE_KEY });
  },

  /** Owner only: revokes one worker's membership. */
  async revokeWorker(workerId) {
    if (!hasHostBridge()) return { ok: false, message: "This needs the installed desktop app." };
    return hostBridge().accountWorkersRevoke({ url: SUPABASE_URL, key: PUBLISHABLE_KEY, workerId });
  },
};
