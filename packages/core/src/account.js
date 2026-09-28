// The shop's own cloud account, whichever shell is asking.
//
// Separate from hq.js and sync.js -- the three answer different questions:
//
//   hq       this shop reports up to an account that watches several shops.
//   sync     you and one other person agree to work off each other's lists.
//   account  a second device signed in to the SAME shop's own cloud copy of
//            its own records. No head office, no other person involved.
//
// Same split as hq.js, and for the same reason: whether there is a native
// side to hide the token in.
import { hasHostBridge } from "./bridge";
import { storage } from "./storage";
import { accountBridge } from "./accountBridge";
import { accountLocal } from "./accountLocal";

function impl() {
  return hasHostBridge() ? accountBridge : accountLocal;
}

export const account = {
  // Unlike hq.available (desktop-only), this is meant to work everywhere --
  // the whole point of "or continue locally" is that it's a real choice on
  // every platform, not a feature only the desktop build has.
  available: () => true,

  // Every real status check keeps the synchronous cache below warm, so any
  // caller anywhere in the app benefits, not just the one that happened to
  // ask first.
  async status(...args) {
    const s = await impl().status(...args);
    cacheStatus(s);
    return s;
  },
  signUp: (...args) => impl().signUp(...args),
  signIn: (...args) => impl().signIn(...args),
  push: (...args) => impl().push(...args),
  pull: (...args) => impl().pull(...args),

  /** Owner only: issues the code a worker's device redeems below. */
  inviteStart: (...args) => impl().inviteStart(...args),
  /** A worker's device, joining with the shop's email, that code, and their
   * own name -- never the shop's password. */
  workerJoin: (...args) => impl().workerJoin(...args),

  /** Owner only: every worker currently connected to this account. */
  listWorkers: (...args) => impl().listWorkers(...args),
  /** Owner only: revokes one worker's membership. */
  revokeWorker: (...args) => impl().revokeWorker(...args),

  /** Forgets the session on this device. A different account signing in
   * later must not inherit these cursors -- it would silently skip
   * everything before whatever point the previous account's sync reached. */
  async signOut(...args) {
    clearAccountCursors();
    clearCachedStatus();
    return impl().signOut(...args);
  },
};

export { accountBridge, accountLocal };

// Where push()/pull() were last left off, and whether this device has
// already been asked "sign in or continue locally". Not secrets -- just a
// timestamp and a choice -- so unlike the session itself these live in
// core's normal storage on every platform, desktop included; there is
// nothing here worth guarding in the main process.
const KEY_PUSH_CURSOR = "techdesk_account_push_cursor";
const KEY_PULL_CURSOR = "techdesk_account_pull_cursor";
const KEY_GATE_DECISION = "techdesk_account_gate_decision";
const KEY_STATUS_CACHE = "techdesk_account_status_cache";

export function getPushCursor() {
  return storage.getItem(KEY_PUSH_CURSOR) || null;
}
export function setPushCursor(cursor) {
  if (cursor) storage.setItem(KEY_PUSH_CURSOR, cursor);
}
export function getPullCursor() {
  return storage.getItem(KEY_PULL_CURSOR) || null;
}
export function setPullCursor(cursor) {
  if (cursor) storage.setItem(KEY_PULL_CURSOR, cursor);
}
function clearAccountCursors() {
  storage.removeItem(KEY_PUSH_CURSOR);
  storage.removeItem(KEY_PULL_CURSOR);
}

/** Asked once, at most, and never again just because the app restarted. */
export function getAccountGateDecision() {
  return storage.getItem(KEY_GATE_DECISION);
}
export function setAccountGateDecision(decision) {
  storage.setItem(KEY_GATE_DECISION, decision);
}

// A worker's device already proved itself once, by redeeming an invite code
// -- it must never sit at admin's own login screen or with admin's own view
// of the shop, even for the one render before an async status() round trip
// (real on the desktop build, where the session lives in the main process)
// comes back and says so. This is that answer, ready before the real one
// is, from whatever the last CONFIRMED status() call actually said -- not a
// guess, and cleared on sign-out so a stale worker role can never survive
// onto a different session on the same device.
export function getCachedAccountStatus() {
  const raw = storage.getItem(KEY_STATUS_CACHE);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function cacheStatus(status) {
  if (status && typeof status === "object") storage.setItem(KEY_STATUS_CACHE, JSON.stringify(status));
}
function clearCachedStatus() {
  storage.removeItem(KEY_STATUS_CACHE);
}
