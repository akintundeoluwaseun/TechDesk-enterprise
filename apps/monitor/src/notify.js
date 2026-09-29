// Telling an owner that something happened, without a push server.
//
// Monitor already asks HQ for a summary every minute, and that summary
// carries the activity feed -- a sale, a repair, with an id and a message.
// So the phone has everything it needs to raise a notification itself; what
// was missing was anything that did.
//
// THIS IS NOT PUSH, AND THE DIFFERENCE MATTERS. A real push notification
// arrives from a server whether or not the app is running. These are local
// notifications: the app raises them off its own refresh, so they arrive
// while Android is still letting Monitor poll -- open, recently open, or
// alive in the background. With the phone idle overnight and the app closed
// for hours, Android stops the polling and nothing arrives until the owner
// opens it again.
//
// The alternative is Firebase, which means a Google project, a
// google-services.json, and a server that holds device tokens. That is worth
// doing later. This is worth having now, needs nothing set up, and covers
// the case it is actually for: an owner with the app on their phone during
// the working day.
import { Preferences } from "@capacitor/preferences";
import { money } from "./currency";

const SEEN_KEY = "techdesk_monitor_seen_activity";
const PREF_KEY = "techdesk_monitor_notify";
const SEEN_MAX = 200;   // ids kept, so the list cannot grow forever

// The same boxing trick session.js needs: a Capacitor plugin is a Proxy, and
// returning one from an async function makes JavaScript call .then() on it,
// which never settles.
let box = null;
async function plugin() {
  if (box) return box;
  try {
    const mod = await import("@capacitor/local-notifications");
    box = { api: mod.LocalNotifications ?? null };
  } catch {
    box = { api: null };   // a browser, or a build without the plugin
  }
  return box;
}

async function read(key, fallback) {
  try {
    const { value } = await Preferences.get({ key });
    return value ? JSON.parse(value) : fallback;
  } catch {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
}

async function write(key, value) {
  const raw = JSON.stringify(value);
  try {
    await Preferences.set({ key, value: raw });
  } catch {
    try { localStorage.setItem(key, raw); } catch { /* best effort */ }
  }
}

/** Has the owner turned these off? Default on -- it is why Monitor exists. */
export async function notificationsEnabled() {
  return (await read(PREF_KEY, true)) !== false;
}

export async function setNotificationsEnabled(on) {
  await write(PREF_KEY, !!on);
}

/** Ask once. Android 13 and newer refuse to show anything without this. */
export async function requestPermission() {
  const { api } = await plugin();
  if (!api) return false;
  try {
    const current = await api.checkPermissions();
    if (current.display === "granted") return true;
    const asked = await api.requestPermissions();
    return asked.display === "granted";
  } catch {
    return false;
  }
}

// What is worth interrupting someone for. A customer record being edited is
// not; money arriving and a repair moving are.
// Sales are announced from the summary's recentSales instead, which carries
// who, what and how much; the activity line only says "Sale recorded".
// `skipSales` is how App says so, when the summary has them.
const WORTH_IT = new Set(["sale", "repair"]);

/**
 * Raise a notification for anything in the feed this phone has not seen.
 *
 * The first run after signing in records what is already there WITHOUT
 * notifying: otherwise an owner opening Monitor for the first time gets
 * twenty notifications for sales they already know about.
 */
export async function notifyNewActivity(activity, { skipSales = false } = {}) {
  const items = (Array.isArray(activity) ? activity : []).filter((a) => !(skipSales && a.type === "sale"));
  if (!items.length) return 0;

  const seen = await read(SEEN_KEY, null);
  const ids = items.map((a) => a.id).filter(Boolean);

  if (seen === null) {
    await write(SEEN_KEY, ids.slice(0, SEEN_MAX));
    return 0;
  }

  if (!(await notificationsEnabled())) {
    // Still record them, so turning notifications back on does not deliver
    // a backlog of everything that happened while they were off.
    await write(SEEN_KEY, [...ids, ...seen].slice(0, SEEN_MAX));
    return 0;
  }

  const known = new Set(seen);
  const fresh = items.filter((a) => a.id && !known.has(a.id) && WORTH_IT.has(a.type));

  if (fresh.length) {
    const { api } = await plugin();
    if (api) {
      try {
        await api.schedule({
          notifications: fresh.slice(0, 5).map((a, i) => ({
            // A stable id from the activity's own id, so the same event
            // cannot arrive twice if a refresh overlaps.
            id: hashId(a.id) + i,
            title: a.branch || "TechDesk",
            body: a.message || "New activity",
            smallIcon: "ic_stat_icon_config_sample",
            schedule: { at: new Date(Date.now() + 100) },
          })),
        });
      } catch {
        // No permission, or no plugin. The feed still updates on screen.
      }
    }
  }

  await write(SEEN_KEY, [...ids, ...seen].slice(0, SEEN_MAX));
  return fresh.length;
}

async function schedule(list) {
  if (!list.length) return;
  const { api } = await plugin();
  if (!api) return;
  try {
    await api.schedule({
      notifications: list.map((n) => ({
        id: hashId(n.id),
        title: n.title,
        body: n.body,
        smallIcon: "ic_stat_icon_config_sample",
        schedule: { at: new Date(Date.now() + 100) },
      })),
    });
  } catch {
    // No permission, or no plugin. The screen still shows it all.
  }
}

/** "Ade made a sale at Ikeja" / "₦12,500 · 2 × Screen guard +1 more · to Bola". */
export function saleNotice(s) {
  const who = s.by || "Someone";
  const item = s.firstItem
    ? `${Number(s.firstQty) > 1 ? `${s.firstQty} × ` : ""}${s.firstItem}${s.itemCount > 1 ? ` +${s.itemCount - 1} more` : ""}`
    : null;
  return {
    id: `sale:${s.id}`,
    title: `${who} made a sale${s.branch ? ` at ${s.branch}` : ""}`,
    body: [
      money(Number(s.total) || 0),
      item,
      s.customer ? `to ${s.customer}` : null,
      s.paymentStatus && s.paymentStatus !== "Paid" ? s.paymentStatus.toLowerCase() : null,
    ].filter(Boolean).join(" · "),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function owedNotice(o) {
  return {
    id: `owed:${o.id}`,
    title: `${o.customer || "A customer"} hasn't paid`,
    body: [`${money(Number(o.amount) || 0)} owed since ${shortDate(o.since)}`, o.branch, o.number].filter(Boolean).join(" · "),
  };
}

export function uncollectedNotice(u) {
  const days = Math.max(1, Math.floor((Date.now() - new Date(u.since).getTime()) / 86_400_000));
  return {
    id: `ready:${u.id}`,
    title: `${u.customer || "A customer"} hasn't come for their ${u.device || "device"}`,
    body: [`Ready for ${days} day${days === 1 ? "" : "s"}`, u.branch, u.phone].filter(Boolean).join(" · "),
  };
}

const SALES_SEEN_KEY = "techdesk_monitor_seen_sales";
const REMINDED_KEY = "techdesk_monitor_reminded";
const DAY = 86_400_000;

/**
 * A notification per sale this phone hasn't seen, with who made it and
 * what. Same first-run rule as the activity feed: the first refresh after
 * signing in records what's there without announcing any of it.
 */
export async function notifyNewSales(recentSales) {
  const items = Array.isArray(recentSales) ? recentSales : [];
  const seen = await read(SALES_SEEN_KEY, null);
  const ids = items.map((s) => s.id).filter(Boolean);
  if (seen === null) {
    await write(SALES_SEEN_KEY, ids.slice(0, SEEN_MAX));
    return 0;
  }
  const known = new Set(seen);
  const fresh = items.filter((s) => s.id && !known.has(s.id));
  await write(SALES_SEEN_KEY, [...ids, ...seen].slice(0, SEEN_MAX));
  if (!fresh.length || !(await notificationsEnabled())) return 0;
  const notes = fresh.slice(0, 4).map(saleNotice);
  if (fresh.length > 4) notes.push({ id: `sales:${Date.now()}`, title: `${fresh.length - 4} more sales`, body: "Open Monitor to see them all." });
  await schedule(notes);
  return fresh.length;
}

/**
 * Who owes and who hasn't collected: once a day each, at most three at a
 * time plus one line for the rest, so a morning check doesn't bury the
 * phone.
 */
export async function notifyReminders(owed, uncollected, now = Date.now()) {
  const all = [
    ...(Array.isArray(owed) ? owed : []).map(owedNotice),
    ...(Array.isArray(uncollected) ? uncollected : []).map(uncollectedNotice),
  ];
  const log = await read(REMINDED_KEY, {});
  const due = all.filter((n) => !log[n.id] || now - log[n.id] >= DAY);
  if (!due.length || !(await notificationsEnabled())) return 0;
  for (const n of due) log[n.id] = now;
  const trimmed = Object.fromEntries(Object.entries(log).sort((a, b) => b[1] - a[1]).slice(0, SEEN_MAX));
  await write(REMINDED_KEY, trimmed);
  const notes = due.length <= 3 ? due : [...due.slice(0, 2), { id: `more:${now}`, title: `${due.length - 2} more need a look`, body: "Unpaid balances and repairs waiting to be collected." }];
  await schedule(notes);
  return due.length;
}

/** Android wants a positive 32-bit int; the id is a string. */
function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2_000_000;
}
