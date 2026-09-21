// One place that knows whether this shop is up to date.
//
// There are two errands -- send what this device did, read what the rest of
// the shop did -- and three things that need to know how they went: the
// background loop that runs them, the sync button in the menu, and the
// Connect to HQ screen. They used to be able to disagree, because the loop
// kept its state in a closure and the screens each asked separately.
//
// So the state lives here, the errands run here, and anything that wants to
// show it subscribes. Nothing in here throws: a shop with no internet is the
// normal case, not a fault, and interrupting someone mid-sale to say so
// would be worse than useless.

import { hq } from "./hq";
import { shop } from "./shop";
import { db } from "./db";
import { can } from "./tier";

const listeners = new Set();

let state = {
  // Whether this device is part of a shop at all. Until this is known the
  // menu shows nothing rather than flashing a sync button at a shop that
  // has never connected.
  connected: null,
  busy: false,
  lastSyncAt: null,
  // Records this device has made that head office has not seen yet.
  waiting: 0,
  // Set only when a sync the shop ASKED for failed. The background loop
  // failing is normal and silent.
  error: "",
};

function set(next) {
  state = { ...state, ...next };
  for (const fn of listeners) {
    try {
      fn(state);
    } catch {
      // A broken listener must not stop the others, or the sync.
    }
  }
}

export function getSyncState() {
  return state;
}

export function subscribeSync(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

/** Re-reads what is waiting, without sending anything. */
export async function refreshSyncState() {
  const status = await hq.status().catch(() => null);
  set({
    connected: Boolean(status?.connected),
    lastSyncAt: status?.lastSyncAt ?? state.lastSyncAt,
    waiting: status?.connected ? db.countUnsynced(status?.lastSyncAt ?? null) : 0,
  });
  return state;
}

let running = false;

/**
 * Send, then read.
 *
 * In that order on purpose: this device's own work going up first means the
 * bench next door is looking at the current version of it before its changes
 * are merged into a list that is about to be sent anyway.
 *
 * `loud` is what the shop tapped. A background run that fails says nothing;
 * a run somebody asked for says what happened.
 */
export async function runSync({ loud = false } = {}) {
  if (running) return { ok: false, error: "busy" };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    if (loud) set({ error: "No internet. Nothing is lost -- this will go up when you're back online." });
    return { ok: false, error: "offline" };
  }

  running = true;
  set({ busy: true, error: "" });

  let result = { ok: true, sent: 0, received: 0 };
  try {
    // A disconnect made with no signal is still owed to the server, and until
    // it lands the device goes on being listed at head office.
    await hq.flushRevoke?.();

    // A batch is capped, so a shop with months behind it would otherwise
    // trickle out one batch per run. Bounded, so a broken `more` cannot spin.
    let guard = 0;
    let res = await hq.sync();
    while (res?.ok && res.more && guard < 20) {
      guard += 1;
      result.sent += res.sent || 0;
      res = await hq.sync();
    }
    if (res?.ok) result.sent += res.sent || 0;
    else result = { ...result, ok: false, error: res?.error, message: res?.message };

    if (can("shareData")) {
      let pulls = 0;
      let got = await shop.pull();
      while (got?.ok && got.more && pulls < 20) {
        pulls += 1;
        result.received += got.received || 0;
        got = await shop.pull();
      }
      if (got?.ok) result.received += got.received || 0;
      // A pull that fails does not fail the whole run: what this device sent
      // still went, and saying "sync failed" would be wrong about the half
      // that worked.
    }
  } catch {
    result = { ok: false, error: "failed" };
  } finally {
    running = false;
  }

  await refreshSyncState();
  set({
    busy: false,
    error: loud && !result.ok
      ? (result.message || "Couldn't reach TechDesk just now. Nothing is lost.")
      : "",
  });
  return result;
}
