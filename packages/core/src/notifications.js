// The notification feed, shared by every surface that shows a bell.
//
// It lived inside Topbar, which is why phones had no notifications at all:
// the topbar hides its controls below md and there was nowhere else for the
// bell to read from. Pulled out so both surfaces show the same list, count
// the same things unread, and clear the same marker.
//
// What an item LOOKS like is not decided here. Each item carries a `type`
// and the app maps that to an icon and a colour -- core has no icons, because
// the same feed has to render in a desktop topbar, a phone drawer, and
// eventually anywhere else.

import { db } from "./db";
import { pendingPaymentsSummary } from "./summary";
import { money } from "./currency";

export function timeAgo(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diffMin = Math.round(Math.max(0, Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

/**
 * A single time-ordered feed: recorded activity, plus anything currently
 * low on stock folded in.
 *
 * Low stock is a live state rather than an event, so it borrows the
 * product's own timestamp. Using "now" would make every item jump to the
 * top of the list every time the bell was opened.
 *
 * `clearedAt` actually empties the list rather than only greying it: Clear
 * used to mark everything read and leave every line where it was, which
 * from the counter looks exactly like a button that does nothing. Anything
 * from before that moment is gone; the next sale, repair or low-stock
 * crossing puts a fresh line at the top.
 */
// `extra` is anything the app wants in the same list that core doesn't keep
// -- messages pushed from the TechDesk console, which live on the device only.
export function notificationFeed(clearedAt = null, limit = 8, extra = []) {
  const activity = db.getActivity();
  const lowStock = db
    .getInventory()
    .filter((p) => Number(p.stock || 0) <= Number(p.lowStockThreshold || 5));

  // Same reasoning as low stock: a live state, not a recorded event, so it
  // borrows a timestamp from the data rather than "now" -- the oldest still
  // owed, so the one line stays put instead of jumping to the top of the
  // list every time the bell is opened.
  const pending = pendingPaymentsSummary(db.getSales(), db.getRepairs());

  const merged = [
    ...extra,
    ...activity,
    ...lowStock.map((p) => ({
      type: "lowstock",
      message: `${p.name || "Item"} — only ${p.stock ?? 0} remaining.`,
      createdAt: p.createdAt || p.updatedAt || new Date(0).toISOString(),
    })),
    ...(pending.count > 0
      ? [{
          type: "owed",
          message: `${pending.count} payment${pending.count === 1 ? "" : "s"} still pending — ${money(pending.total, db.getSettings())} owed.`,
          createdAt: pending.oldestAt || new Date(0).toISOString(),
        }]
      : []),
  ];
  const cut = clearedAt ? new Date(clearedAt) : null;
  // >= rather than >: clearing and then selling in the same millisecond is
  // rare but real, and dropping that sale's line is a notification the shop
  // never sees.
  const kept = cut ? merged.filter((item) => new Date(item.createdAt) >= cut) : merged;
  kept.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return kept.slice(0, limit);
}

export function isUnread(item, clearedAt) {
  // Same boundary as the feed above, so what is shown and what counts as
  // new can never disagree.
  return !clearedAt || new Date(item.createdAt) >= new Date(clearedAt);
}

export function unreadCount(feed, clearedAt) {
  return feed.filter((item) => isUnread(item, clearedAt)).length;
}
