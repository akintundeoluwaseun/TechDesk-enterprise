// Syncing with one other person.
//
// This is NOT head office, and it is not sharing. The three are separate
// things and the difference is the point:
//
//   Connect to HQ   this shop reports up to an account that watches several.
//   Share your data that is HQ Monitor, looking down at what was reported.
//   Sync your data  you and somebody else agree to work off each other's
//                   lists. You type their number, they read you the code,
//                   and you are linked. Nobody's head office is involved.
//
// A link is between TWO devices. Three people is three links -- A to B, B to
// C, C to D -- and each side of each link ticks, separately, what IT sends
// over THAT link.
//
// WHICH MEANS IT FLOWS. If B sends C what it has, C sees A's stock too,
// because B passes on what B receives. The tick that stops it is B's.
//
// WHAT COMES BACK, AND WHY IT IS TWO THINGS.
//
//   somebody else's  -- their stock, in my list, marked as theirs.
//   my own           -- a record of MINE that somebody else changed.
//
// The second is not an afterthought. Records belong to the device that made
// them and go on belonging to it after an edit, so the device that owns a
// part would never pull its own part back as a stranger's -- and its screen
// would go on showing the old count forever while everybody else showed the
// new one. That is the bug this half exists to prevent.
//
// WHAT NEVER GOES BACK UP. A record pulled from somebody else is not re-sent
// on the next push unless it has been edited here since. Without that the two
// devices hand the same record back and forth: each push marks the sender as
// the last writer, which makes the other side pull it as "changed by somebody
// else", which makes it push, forever. sharedSeenAt is the line between "this
// arrived over a sync" and "somebody here changed it".

import { storage } from "./storage";
import { emitChanged } from "./events";
import { hasHostBridge, hostBridge } from "./bridge";
import { readState, saveState, installId } from "./hqStore";

const SUPABASE_URL = "https://wuwerzyydtvargvqjufb.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_aiiQjedgBx4Tq-NX_jIGtw_ekAYgxV_";

// This device's own sync settings, and how far through the changes it has
// read. Kept apart from the HQ connection: they are turned on and off
// separately, and a shop that disconnects from head office has not asked to
// stop syncing with the bench next to it.
const KEY_SYNC = "techdesk_sync";

/** The kinds a link can carry. The server keeps the same list and drops the rest. */
export const SYNCABLE = ["product", "repair", "customer"];

// What each kind is called on screen, and which local list it lands in.
const KIND_LABELS = {
  product: "Stock",
  repair: "Repairs",
  customer: "Customers",
};

const KIND_KEYS = {
  product: "techdesk_inventory",
  repair: "techdesk_repairs",
  customer: "techdesk_customers",
};

export function syncLabel(kind) {
  return KIND_LABELS[kind] || kind;
}

function readSync() {
  try {
    const raw = storage.getItem(KEY_SYNC);
    const s = raw ? JSON.parse(raw) : {};
    return {
      registered: Boolean(s.registered),
      phone: s.phone || null,
      label: s.label || null,
      links: Array.isArray(s.links) ? s.links : [],
      // Everybody whose records reach this device, named. Not the same list
      // as `links`: a device linked only to one other still receives from
      // whoever THAT one receives from, and the screen has to be able to say
      // so or the chain is invisible from inside it.
      reaching: Array.isArray(s.reaching) ? s.reaching : [],
      reachable: Array.isArray(s.reachable) ? s.reachable : [],
      cursor: s.cursor || null,
      lastPullAt: s.lastPullAt || null,
      received: Number(s.received) || 0,
    };
  } catch {
    return { registered: false, phone: null, label: null, links: [], reachable: [], cursor: null, lastPullAt: null };
  }
}

function writeSync(next) {
  try {
    storage.setItem(KEY_SYNC, JSON.stringify(next));
  } catch {
    // A browser that cannot store this syncs nothing across reloads, which is
    // the safe direction to fail in.
  }
}

function readList(key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function post(fn, body, token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token || PUBLISHABLE_KEY}`,
        "apikey": PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return {
      ok: false,
      error: "offline",
      message: "Couldn't reach TechDesk. Check your internet and try again.",
    };
  }
}

/**
 * The desktop keeps its token in Electron's main process, so the posting
 * happens there and this hands over what to post. Everywhere else this
 * context holds the token and posts for itself. Same split, and the same
 * reason, as hq.js.
 *
 * `token` is left to the caller's side of the bridge on purpose: the renderer
 * never sees it, and here it is read from storage rather than passed in, so
 * there is one answer to "which device is this" whichever shell is asking.
 */
async function call(fn, body) {
  if (hasHostBridge()) {
    const bridge = hostBridge();
    if (!bridge.syncCall) return { ok: false, error: "unsupported" };
    return await bridge.syncCall({ url: SUPABASE_URL, key: PUBLISHABLE_KEY, fn, body });
  }
  const state = readState();
  return await post(fn, { ...body, installId: installId(), token: state.token }, state.token);
}

/**
 * Puts what arrived over a sync into this device's own lists.
 *
 * Merged rather than replaced, because these lists are where the shop works:
 * an incoming record joins them, and one that is gone leaves them. Every
 * record that arrives is stamped with sharedSeenAt, which is what keeps it
 * from being pushed straight back out again.
 */
export function mergeSynced(records) {
  const touched = new Set();
  const counts = { added: 0, updated: 0, removed: 0 };

  // Grouped so each list is read and written once, not once per record. A
  // device catching up on a month of changes would otherwise rewrite its
  // whole inventory four hundred times.
  const byKind = new Map();
  for (const rec of records || []) {
    if (!rec?.id || !KIND_KEYS[rec.kind]) continue;
    if (!byKind.has(rec.kind)) byKind.set(rec.kind, []);
    byKind.get(rec.kind).push(rec);
  }

  for (const [kind, list] of byKind) {
    const key = KIND_KEYS[kind];
    const rows = readList(key);
    const index = new Map(rows.map((r, i) => [r.id, i]));
    let changed = false;

    for (const rec of list) {
      const at = index.get(rec.id);

      if (rec.deleted) {
        if (at !== undefined) {
          rows.splice(at, 1);
          // The index is stale after a splice, so it is rebuilt rather than
          // patched. Deletes are rare; a wrong index is a corrupted list.
          index.clear();
          rows.forEach((r, i) => index.set(r.id, i));
          counts.removed += 1;
          changed = true;
        }
        continue;
      }

      const incoming = {
        ...(rec.payload || {}),
        id: rec.id,
        updatedAt: rec.updatedAt,
        // Whose it is, for the badge in the list. A record of this device's
        // own that somebody else edited is still this device's own, so it
        // gets no badge -- only the corrected values.
        //
        // The owner's id travels with it as well as their name, because a
        // name is for reading and an id is what prune() needs when a link is
        // cut three devices away and their records have to come back out.
        ...(rec.mine
          ? { sharedFrom: undefined, syncedOwnerId: undefined }
          : { sharedFrom: rec.owner || "Synced", syncedOwnerId: rec.ownerId || null }),
        // The line between "this arrived over a sync" and "somebody here
        // changed it". See the note at the top of this file.
        sharedSeenAt: rec.updatedAt,
      };

      if (at === undefined) {
        rows.push(incoming);
        index.set(rec.id, rows.length - 1);
        counts.added += 1;
      } else {
        // Forwards only. A page of changes that arrives out of order must not
        // put an older version of a record over a newer one.
        const have = rows[at];
        const mine = new Date(have.updatedAt || 0).getTime();
        const theirs = new Date(rec.updatedAt || 0).getTime();
        if (Number.isFinite(theirs) && theirs < mine) continue;
        rows[at] = { ...have, ...incoming };
        counts.updated += 1;
      }
      changed = true;
    }

    if (changed) {
      try {
        storage.setItem(key, JSON.stringify(rows));
        touched.add(key);
      } catch {
        // Out of space. The cursor is not moved below, so the same page is
        // fetched again rather than skipped.
        return { ...counts, stored: false };
      }
    }
  }

  for (const key of touched) emitChanged(key);
  return { ...counts, stored: true };
}

/**
 * Takes out everything that came from somebody who no longer reaches us.
 *
 * Cutting a link has to empty the lists it filled, and the cut may have
 * happened at the far end of a chain -- B unlinking C takes C AND D off A's
 * screen, and A was never told. So the server says who still reaches this
 * device on every pull, and anything here from anybody else goes.
 *
 * Only records that arrived over a sync are touched. A row this device typed
 * has no owner stamped on it and is never anybody else's to take away.
 */
export function pruneUnreachable(reachable) {
  const keep = new Set(reachable || []);
  const counts = { removed: 0 };

  for (const key of Object.values(KIND_KEYS)) {
    const rows = readList(key);
    const left = rows.filter((r) => !r?.syncedOwnerId || keep.has(r.syncedOwnerId));
    if (left.length === rows.length) continue;

    counts.removed += rows.length - left.length;
    try {
      storage.setItem(key, JSON.stringify(left));
      emitChanged(key);
    } catch {
      // Nothing to do. The rows stay, and the next pull tries again.
    }
  }

  return counts;
}

export const sync = {
  /** What this device knows without asking the server. */
  status() {
    const s = readSync();
    const state = readState();
    return {
      // Whether this device has an identity on the server at all. Without
      // one there is nothing to sync with and nothing to sync as.
      ready: Boolean(state.token),
      registered: s.registered,
      phone: s.phone,
      label: s.label,
      links: s.links,
      reaching: s.reaching,
      reachable: s.reachable,
      lastPullAt: s.lastPullAt,
      received: s.received || 0,
    };
  },

  /** Who we are linked to, and what each side is sending. From the server. */
  async refresh() {
    const res = await call("sync-links", { action: "state" });
    if (!res?.ok) return res;

    const current = readSync();
    writeSync({
      ...current,
      registered: Boolean(res.registered),
      phone: res.phone || null,
      label: res.label || null,
      links: res.links || [],
      reaching: res.reaching || [],
      reachable: res.reachable || [],
    });
    return res;
  },

  /** Step one of putting your own number in: ask for the code. */
  async registerStart(phone, label) {
    return await call("sync-start", { mode: "register", phone, label });
  },

  /**
   * Step two: the code. This is where a device with no head office gets the
   * identity it needs to sync at all, so the token that comes back is kept.
   */
  async registerVerify({ state, otpId, code }) {
    const res = await call("sync-verify", { mode: "register", state, otpId, code });
    if (!res?.ok) return res;

    // On the desktop the token never came here -- the main process kept it --
    // so there is nothing to store and `token` is absent.
    if (res.token) saveState({ ...readState(), token: res.token, deviceId: res.deviceId });

    const current = readSync();
    writeSync({ ...current, registered: true, phone: res.phone || current.phone });
    await sync.refresh();
    return res;
  },

  /** Step one of syncing with somebody: their number, and a code sent to it. */
  async pairStart(phone) {
    return await call("sync-start", { mode: "pair", phone });
  },

  /** Step two: the code they read out. */
  async pairVerify({ state, otpId, code }) {
    const res = await call("sync-verify", { mode: "pair", state, otpId, code });
    if (res?.ok) await sync.refresh();
    return res;
  },

  /**
   * Sets what this device sends over ONE link.
   *
   * What is stored locally is what the SERVER kept, not what was asked for.
   * A kind it dropped un-ticks itself on the screen rather than sitting there
   * looking like it is being sent when it is not.
   */
  async setKinds(linkId, kinds) {
    const want = (kinds || []).filter((k) => SYNCABLE.includes(k));
    const res = await call("sync-links", { action: "kinds", linkId, kinds: want });
    if (!res?.ok) return res;

    const current = readSync();
    writeSync({
      ...current,
      links: current.links.map((l) => (l.id === linkId ? { ...l, iSend: res.kinds || [] } : l)),
    });
    return res;
  },

  /** Cuts a link. Their records come out of the lists on the next pull. */
  async unlink(linkId) {
    const res = await call("sync-links", { action: "unlink", linkId });
    if (res?.ok) await sync.refresh();
    return res;
  },

  /**
   * Reads what has reached this device since last time, and puts it in the
   * lists.
   *
   * The cursor moves only once the records are actually stored, for the same
   * reason the push cursor does: a page that was fetched and lost has to be
   * fetched again, not skipped.
   */
  async pull() {
    const state = readState();
    if (!state.token) return { ok: false, error: "not_registered", received: 0 };

    const current = readSync();
    const res = await call("sync-pull", { since: current.cursor, limit: 400 });
    if (!res?.ok) return { ...res, received: 0 };

    const merged = mergeSynced(res.records);
    if (!merged.stored) return { ok: false, error: "storage_full", received: 0 };

    writeSync({
      ...current,
      cursor: res.cursor || current.cursor,
      lastPullAt: new Date().toISOString(),
      // What the last check actually brought in. "Last checked 10:42" alone
      // does not tell a shop whether syncing is working -- a screen that says
      // it checked and says nothing about what it found is the one people
      // stare at wondering.
      received: (res.records || []).length,
    });

    return {
      ok: true,
      received: (res.records || []).length,
      more: Boolean(res.more),
      ...merged,
    };
  },

  /**
   * A pull, then a tidy-up: anything from somebody who no longer reaches this
   * device comes out. Asked for separately from pull() because it costs a
   * second call and a full page walk is not the moment to do it.
   */
  async pullAndPrune() {
    const got = await sync.pull();
    if (!got?.ok) return got;

    const state = await sync.refresh();
    if (state?.ok) pruneUnreachable(state.reachable);
    return got;
  },

  /** Forgets what is set up here, without touching the links on the server. */
  reset() {
    writeSync({
      registered: false,
      phone: null,
      label: null,
      links: [],
      reaching: [],
      reachable: [],
      cursor: null,
      lastPullAt: null,
      received: 0,
    });
  },
};

/**
 * Has this record been touched here since it arrived over a sync?
 *
 * The push side asks this, so a record that only arrived is not sent straight
 * back. The stored field is still called sharedSeenAt: records written by
 * every version since 4.1.0 carry that name, and renaming it on disk would
 * make every one of them look like a local edit on the next sync.
 */
export function changedSinceSync(row) {
  if (!row?.sharedSeenAt) return true;
  const seen = new Date(row.sharedSeenAt).getTime();
  const at = new Date(row.updatedAt || 0).getTime();
  if (!Number.isFinite(seen) || !Number.isFinite(at)) return true;
  return at > seen;
}
