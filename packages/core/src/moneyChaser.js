// The money chaser: everyone who owes the shop, and the right words to ask.
//
// Debts are gathered per customer (sales not fully paid, finished repairs not
// paid), each with how long it has been owed and how often the shop has
// already asked. The message gets firmer with each reminder -- friendly,
// then a reminder, then firm -- and a promise to pay by a date is held to
// that date. Every message can carry how to pay by transfer, so the customer
// can settle it from the chat.
//
// Nothing is sent from here: the app opens WhatsApp with the words ready and
// the shop presses send. Worked out on the device; no AI, no server.
import { db } from "./db";
import { storage } from "./storage";
import { saleOwed, repairOwed, repairTotal, isOpenRepair } from "./summary";

const DAY = 86400000;
const LOG_KEY = "techdesk_chase_log";
export const GRACE_DAYS = 3; // a debt younger than this isn't chased yet
export const TONES = ["friendly", "reminder", "firm", "promise"];
export const TONE_LABEL = { friendly: "Friendly", reminder: "Reminder", firm: "Firm", promise: "Promise" };
export const LANGS = { en: "English" };

const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
const time = (iso) => { const n = new Date(iso).getTime(); return Number.isFinite(n) ? n : null; };
const digits = (s) => String(s || "").replace(/\D/g, "");
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "";

// ---------------------------------------------------------------- log ----
export function chaseLog() {
  try {
    const v = JSON.parse(storage.getItem(LOG_KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function saveLog(log) {
  storage.setItem(LOG_KEY, JSON.stringify(log));
}
/** Remembers that this customer was just asked, and how. */
export function markChased(key, tone, now = new Date()) {
  const log = chaseLog();
  const e = log[key] || { count: 0, history: [] };
  e.count += 1;
  e.lastAt = now.toISOString();
  e.history = [...(e.history || []), { at: e.lastAt, tone }].slice(-10);
  log[key] = e;
  saveLog(log);
  return e;
}
/** "Will pay on Friday": a YYYY-MM-DD, or null to clear. */
export function setPromise(key, day) {
  const log = chaseLog();
  const e = log[key] || { count: 0, history: [] };
  if (day) e.promise = day;
  else delete e.promise;
  log[key] = e;
  saveLog(log);
  return e;
}
function clearChase(key) {
  const log = chaseLog();
  delete log[key];
  saveLog(log);
}

// ------------------------------------------------------------ debtors ----
/** One key per customer: their record if there is one, else their phone, else their name. */
export function debtorKey(r) {
  if (r.customerId) return `c:${r.customerId}`;
  const ph = digits(r.customerPhone).slice(-10);
  if (ph.length >= 7) return `p:${ph}`;
  const name = String(r.customerName || "").trim().toLowerCase();
  return name && name !== "walk-in" ? `n:${name}` : "walk-in";
}

function saleLabel(s) {
  const items = (s.items || []).map((i) => `${i.name}${Number(i.qty) > 1 ? ` ×${i.qty}` : ""}`);
  const what = items.length > 2 ? `${items.slice(0, 2).join(", ")} +${items.length - 2} more` : items.join(", ");
  return [s.invoice, what].filter(Boolean).join(" · ") || "a sale";
}
function repairLabel(r) {
  return [r.ticket, `${r.device || "device"} repair`].filter(Boolean).join(" · ");
}

/**
 * Everyone who owes, with what for and how chasing has gone. `status` is
 * where they belong today: "due" (chase now), "promised" (paying by a date
 * still ahead), "asked" (already asked today), or "recent" (owed fewer
 * than GRACE_DAYS days -- too soon to chase).
 */
export function debtors(data = {}, now = new Date(), { includeRepairs = true } = {}) {
  const sales = data.sales || db.getSales();
  const repairs = includeRepairs ? data.repairs || db.getRepairs() : [];
  const customers = data.customers || db.getCustomers();
  const log = data.log || chaseLog();
  const today = startOfDay(now);
  const todayKey = dayKey(now);
  const days = (ms) => (ms == null ? 0 : Math.max(0, Math.round((today - startOfDay(ms)) / DAY)));

  const by = new Map();
  const add = (r, kind, owed, at, label) => {
    if (owed <= 0) return;
    const key = debtorKey(r);
    const c = r.customerId ? customers.find((x) => x.id === r.customerId) : null;
    const e = by.get(key) || { key, name: "", phone: "", customerId: r.customerId || null, total: 0, items: [], oldest: Infinity };
    e.name = e.name || c?.name || (r.customerName && r.customerName !== "Walk-in" ? r.customerName : "");
    e.phone = e.phone || c?.phone || r.customerPhone || "";
    e.total += owed;
    e.oldest = Math.min(e.oldest, at ?? Infinity);
    e.items.push({ kind, id: r.id, owed, at, days: days(at), label });
    by.set(key, e);
  };
  sales.forEach((s) => add(s, "sale", saleOwed(s), time(s.createdAt), saleLabel(s)));
  // A job still on the bench isn't owed yet; once it's done, it is.
  repairs.filter((r) => repairTotal(r) > 0 && !isOpenRepair(r)).forEach((r) =>
    add(r, "repair", repairOwed(r), time(r.readyAt) ?? time(r.createdAt), repairLabel(r))); // not updatedAt: a part-payment would restart the clock

  return [...by.values()]
    .filter((e) => e.key !== "walk-in")
    .map((e) => {
      const chase = log[e.key] || { count: 0 };
      const d = Number.isFinite(e.oldest) ? days(e.oldest) : 0;
      const askedToday = chase.lastAt && dayKey(new Date(chase.lastAt)) === todayKey;
      const promised = chase.promise && chase.promise >= todayKey;
      const broken = chase.promise && chase.promise < todayKey;
      const status = promised ? "promised" : askedToday ? "asked" : d < GRACE_DAYS && !broken ? "recent" : "due";
      return {
        ...e,
        items: e.items.sort((a, b) => (a.at ?? 0) - (b.at ?? 0)),
        days: d,
        chase: { count: chase.count || 0, lastAt: chase.lastAt || null, promise: chase.promise || null, broken: !!broken },
        status,
        tone: toneFor({ days: d, chase: { count: chase.count || 0, broken: !!broken } }),
      };
    })
    .sort((a, b) => (b.chase.broken ? 1 : 0) - (a.chase.broken ? 1 : 0) || b.total - a.total);
}

/** How firm the next message should be. */
export function toneFor(d) {
  if (d.chase?.broken) return "promise";
  const n = d.chase?.count || 0;
  if (n >= 2 || d.days >= 30) return "firm";
  if (n === 1 || d.days >= 14) return "reminder";
  return "friendly";
}

// ----------------------------------------------------------- messages ----
const T = {
  en: {
    pay: (to) => `You can pay by transfer to: ${to}`,
    friendly: (v) => `Hello ${v.first}, hope you're well. A quick reminder from ${v.shop}: ${v.amount} is still outstanding for ${v.items}.${v.pay}\n\nThank you!`,
    reminder: (v) => `Hello ${v.first}, this is ${v.shop} again. The balance of ${v.amount} for ${v.items} has been outstanding for ${v.days} days. Please could you settle it this week?${v.pay}\n\nThank you.`,
    firm: (v) => `Hello ${v.first}. ${v.shop.charAt(0).toUpperCase()}${v.shop.slice(1)} here. ${v.amount} for ${v.items} has now been outstanding for ${v.days} days${v.count ? `, and we have reminded you ${v.count} time${v.count === 1 ? "" : "s"}` : ""}. Please pay today, or call us to agree a date.${v.pay}`,
    promise: (v) => `Hello ${v.first}, ${v.shop} here. You said you would pay the ${v.amount} by ${v.promise}. Please send it today.${v.pay}\n\nThank you.`,
  },
};

/** The words for this customer, ready to paste into WhatsApp. */
export function chaseMessage(d, { tone, lang = "en", shop = "", payTo = "", money = (n) => String(Math.round(n)) } = {}) {
  const L = T[lang] || T.en;
  const tn = T.en[tone] ? tone : d.tone || "friendly";
  const items = d.items.length === 1 ? d.items[0].label : `${d.items.length} unpaid ${d.items.every((i) => i.kind === "repair") ? "repairs" : "purchases"} (${d.items.slice(0, 2).map((i) => i.label.split(" · ")[0]).join(", ")}${d.items.length > 2 ? ", …" : ""})`;
  const promise = d.chase?.promise ? new Date(`${d.chase.promise}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }) : "the date you gave";
  return L[tn]({
    first: first(d.name) || "there",
    shop: shop || "the shop",
    amount: money(d.total),
    items,
    days: d.days,
    count: d.chase?.count || 0,
    promise,
    pay: payTo.trim() ? `\n\n${L.pay(payTo.trim())}` : "",
  });
}

// ------------------------------------------------------------ payment ----
/**
 * Records money received from this customer, oldest debt first. Returns
 * {applied, undo}. Paying it all clears the chasing history.
 */
export function recordPayment(d, amount, { method = "Cash", actor, now = new Date() } = {}) {
  let left = Math.min(Math.max(0, Number(amount) || 0), d.total);
  const undo = [];
  let applied = 0;
  for (const it of d.items) {
    if (left <= 0) break;
    const pay = Math.min(left, it.owed);
    if (it.kind === "sale") {
      const before = db.getSales().find((s) => s.id === it.id);
      if (!before) continue;
      const total = Number(before.total || 0);
      const paid = Math.min(total, Number(before.amountPaid || 0) + pay);
      db.updateSale(before.id, { amountPaid: paid, paymentStatus: paid >= total ? "Paid" : "Pending" });
      db.logActivity({ type: "sale", message: `Payment of ${pay} (${method}) recorded on ${before.invoice}`, refId: before.id, actor });
      undo.unshift(() => db.updateSale(before.id, { amountPaid: before.amountPaid, paymentStatus: before.paymentStatus }));
    } else {
      const before = db.getRepairs().find((r) => r.id === it.id);
      if (!before) continue;
      const total = repairTotal(before);
      const paid = Math.min(total, Number(before.amountPaid || 0) + pay);
      db.updateRepair(before.id, { amountPaid: paid, paymentStatus: paid >= total ? "Paid" : "Partial" });
      db.logActivity({ type: "repair", message: `Payment of ${pay} (${method}) recorded on ${before.ticket}`, refId: before.id, actor });
      undo.unshift(() => db.updateRepair(before.id, { amountPaid: before.amountPaid, paymentStatus: before.paymentStatus }));
    }
    left -= pay;
    applied += pay;
  }
  if (applied >= d.total) {
    const kept = chaseLog()[d.key];
    clearChase(d.key);
    if (kept) undo.push(() => { const log = chaseLog(); log[d.key] = kept; saveLog(log); });
  }
  return { applied, undo };
}

export function runChaseUndo(undo) {
  for (const step of undo || []) {
    try {
      step();
    } catch {
      // Changed since: leave it.
    }
  }
}
