// Sharing with the rest of the shop.
//
// Two people behind the same counter, each with their own copy of TechDesk
// and their own stock -- the Samsung bench and the iPhone bench. Each ticks
// what it is willing to share; what it shares appears in the others' lists,
// labelled with whose it is, and can be changed from there as well as read.
//
// WHAT COMES BACK, AND WHY IT IS TWO THINGS.
//
//   somebody else's  -- their stock, in my list, marked as theirs.
//   my own           -- a record of MINE that somebody else changed.
//
// The second is not an afterthought. Records belong to the device that made
// them and go on belonging to it after an edit, so the bench that owns a part
// would never pull its own part back as a stranger's -- and its screen would
// go on showing the old count forever while the whole rest of the shop showed
// the new one. That is the bug this half exists to prevent.
//
// WHAT NEVER GOES BACK UP. A record pulled from somebody else is not re-sent
// on the next push unless it has been edited here since. Without that the two
// devices hand the same record back and forth: each push marks the sender as
// the last writer, which makes the other side pull it as "changed by somebody
// else", which makes it push, forever. sharedSeenAt is the line between "this
// arrived from the shop" and "somebody here changed it".

import { storage } from "./storage";
import { emitChanged } from "./events";
import { hasHostBridge, hostBridge } from "./bridge";
import { readState } from "./hqStore";

const SUPABASE_URL = "https://wuwerzyydtvargvqjufb.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_aiiQjedgBx4Tq-NX_jIGtw_ekAYgxV_";

// What this device shares, and how far through the shop's changes it has
// read. Kept apart from the HQ connection: they are turned on and off
// separately, and a shop that disconnects from head office has not asked to
// stop sharing with the bench next to it.
const KEY_SHARE = "techdesk_shop_share";

/** The kinds a shop can tick. The server keeps the same list and drops the rest. */
export const SHAREABLE = ["product", "repair", "customer"];

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

export function shareLabel(kind) {
  return KIND_LABELS[kind] || kind;
}

function readShare() {
  try {
    const raw = storage.getItem(KEY_SHARE);
    const s = raw ? JSON.parse(raw) : {};
    return {
      kinds: Array.isArray(s.kinds) ? s.kinds.filter((k) => SHAREABLE.includes(k)) : [],
      cursor: s.cursor || null,
      lastPullAt: s.lastPullAt || null,
    };
  } catch {
    return { kinds: [], cursor: null, lastPullAt: null };
  }
}

function writeShare(next) {
  try {
    storage.setItem(KEY_SHARE, JSON.stringify(next));
  } catch {
    // A browser that cannot store this shares nothing across reloads, which
    // is the safe direction to fail in.
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
    return { ok: false, error: "offline", message: "Couldn't reach TechDesk. Check your internet and try again." };
  }
}

// The desktop keeps its token in Electron's main process, so the posting
// happens there. Everywhere else this context holds it and posts for itself.
// Same split, and the same reason, as hq.js.
async function call(fn, body) {
  if (hasHostBridge()) {
    const bridge = hostBridge();
    const send = fn === "shop-share" ? bridge.shopShare : bridge.shopPull;
    if (!send) return { ok: false, error: "unsupported" };
    return await send({ url: SUPABASE_URL, key: PUBLISHABLE_KEY, ...body });
  }
  const state = readState();
  if (!state.token) return { ok: false, error: "not_connected" };
  return await post(fn, { ...body, token: state.token }, state.token);
}

/**
 * Puts what the shop shared into this device's own lists.
 *
 * Merged rather than replaced, because these lists are where the shop works:
 * an incoming record joins them, and one that is gone leaves them. Every
 * record that arrives is stamped with sharedSeenAt, which is what keeps it
 * from being pushed straight back out again.
 */
export function mergeShared(records) {
  const touched = new Set();
  const counts = { added: 0, updated: 0, removed: 0 };

  // Grouped so each list is read and written once, not once per record. A
  // shop catching up on a month of changes would otherwise rewrite its whole
  // inventory four hundred times.
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
        ...(rec.mine ? { sharedFrom: undefined } : { sharedFrom: rec.owner || "Shop" }),
        // The line between "this arrived from the shop" and "somebody here
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

export const shop = {
  /** What this device shares, and when it last read the shop's changes. */
  status() {
    const { kinds, lastPullAt } = readShare();
    const state = readState();
    return {
      connected: Boolean(state.connected),
      shopName: state.branchName || null,
      kinds,
      lastPullAt,
    };
  },

  /**
   * Sets what this device shares.
   *
   * What is stored locally is what the SERVER kept, not what was asked for.
   * A kind it dropped un-ticks itself on the screen rather than sitting there
   * looking shared when it is not.
   */
  async setSharing(kinds) {
    const want = (kinds || []).filter((k) => SHAREABLE.includes(k));
    const res = await call("shop-share", { kinds: want });
    if (!res?.ok) return res;

    const current = readShare();
    writeShare({ ...current, kinds: res.kinds || [] });
    return { ok: true, kinds: res.kinds || [] };
  },

  /**
   * Reads what the shop has shared since last time, and puts it in the lists.
   *
   * The cursor moves only once the records are actually stored, for the same
   * reason the push cursor does: a page that was fetched and lost has to be
   * fetched again, not skipped.
   */
  async pull() {
    const current = readShare();
    const res = await call("shop-pull", { since: current.cursor, limit: 400 });
    if (!res?.ok) return { ...res, received: 0 };

    const merged = mergeShared(res.records);
    if (!merged.stored) return { ok: false, error: "storage_full", received: 0 };

    writeShare({
      ...current,
      cursor: res.cursor || current.cursor,
      lastPullAt: new Date().toISOString(),
    });

    return {
      ok: true,
      received: (res.records || []).length,
      more: Boolean(res.more),
      ...merged,
    };
  },

  /** Forgets what was shared here, without touching what the shop has. */
  reset() {
    writeShare({ kinds: [], cursor: null, lastPullAt: null });
  },
};

// Re-exported so the push side can ask the same question this file answers:
// has this record been touched here since it arrived from the shop?
export function changedSinceShared(row) {
  if (!row?.sharedSeenAt) return true;
  const seen = new Date(row.sharedSeenAt).getTime();
  const at = new Date(row.updatedAt || 0).getTime();
  if (!Number.isFinite(seen) || !Number.isFinite(at)) return true;
  return at > seen;
}
