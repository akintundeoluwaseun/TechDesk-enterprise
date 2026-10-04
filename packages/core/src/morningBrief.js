// The morning brief: what a shop owner wants to know before opening up.
//
// How the last trading day went, who still owes, which finished repairs are
// waiting to be collected, what's run out -- and a short list of what to do
// about it today. Worked out here, on the device, from the shop's own
// records: no AI, no server, so it costs nothing, works offline, and nothing
// about the shop leaves the phone.
//
// It shows itself once a day, on the first start before 2pm, and can be
// opened from the menu any time.
import { db } from "./db";
import { storage } from "./storage";
import { saleOwed, repairOwed, repairTotal, isOpenRepair } from "./summary";

const DAY = 86400000;
const SEEN_KEY = "techdesk_brief_seen";
const OFF_KEY = "techdesk_brief_off";
export const MORNING_ENDS_AT = 14; // after 2pm it's no longer a morning brief

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const t = (iso) => { const n = new Date(iso).getTime(); return Number.isFinite(n) ? n : null; };
const num = (v) => Number(v) || 0;

function itemCost(item, inventory) {
  if (item.costPrice != null && item.costPrice !== "") return num(item.costPrice) * num(item.qty);
  const p = item.productId ? inventory.find((x) => x.id === item.productId) : null;
  return p ? num(p.costPrice) * num(item.qty) : 0;
}

/** Takings and profit for [from, to), counted the way the Reports page counts them. */
function takings(sales, repairs, inventory, from, to) {
  const inRange = (r) => { const at = t(r.createdAt); return at !== null && at >= from && at < to; };
  const S = sales.filter(inRange);
  const done = repairs.filter(inRange).filter((r) => ["completed", "delivered"].includes(String(r.status || "").toLowerCase()));
  const revenue = S.reduce((n, s) => n + num(s.total), 0);
  const labour = done.reduce((n, r) => n + num(r.repairCost), 0);
  const cost = S.reduce((n, s) => n + (s.items || []).reduce((m, i) => m + itemCost(i, inventory), 0), 0);
  return { total: revenue + labour, sales: S.length, repairs: done.length, profit: revenue + labour - cost };
}

const nameOf = (r) => (r.customerName && r.customerName !== "Walk-in" ? r.customerName : "");
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";

/**
 * Everything the brief shows. `empty` is true for a shop with nothing in it
 * yet -- there's nothing to brief.
 */
export function buildBrief(data = {}, now = new Date()) {
  const sales = data.sales || db.getSales();
  const repairs = data.repairs || db.getRepairs();
  const inventory = data.inventory || db.getInventory();
  const today = startOfDay(now).getTime();
  const hour = now.getHours();
  // Calendar days, the way a shop counts them: Monday to Wednesday is 2 days, whatever the hour.
  const daysSince = (ms) => (ms == null || !Number.isFinite(ms) ? 0 : Math.max(0, Math.round((today - startOfDay(ms).getTime()) / DAY)));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // The last day the shop traded, within the past week: on a Monday that's
  // Saturday, not an empty Sunday.
  let lastDay = today - DAY;
  for (let back = 1; back <= 7; back++) {
    const from = today - back * DAY;
    const tk = takings(sales, repairs, inventory, from, from + DAY);
    if (tk.sales || tk.repairs) { lastDay = from; break; }
  }
  const last = takings(sales, repairs, inventory, lastDay, lastDay + DAY);
  const weekBefore = takings(sales, repairs, inventory, lastDay - 7 * DAY, lastDay - 6 * DAY);
  const lastDate = new Date(lastDay);
  const lastLabel = lastDay === today - DAY ? "Yesterday" : lastDate.toLocaleDateString(undefined, { weekday: "long" });
  const change = weekBefore.total > 0 ? Math.round(((last.total - weekBefore.total) / weekBefore.total) * 100) : null;

  // This week so far (Monday to now) against the same days last week.
  const monday = today - ((new Date(today).getDay() + 6) % 7) * DAY;
  const week = takings(sales, repairs, inventory, monday, today + DAY);
  const lastWeekSoFar = takings(sales, repairs, inventory, monday - 7 * DAY, today + DAY - 7 * DAY);

  // Who owes, by customer, oldest debt first within each.
  const owedBy = new Map();
  const addOwed = (r, amount, kind, since = t(r.createdAt)) => {
    if (amount <= 0) return;
    const name = nameOf(r) || "Walk-in customers";
    const key = (r.customerId || name).toString().toLowerCase();
    const e = owedBy.get(key) || { name, phone: r.customerPhone || "", amount: 0, since: Infinity, items: 0 };
    e.amount += amount;
    e.items += 1;
    e.phone = e.phone || r.customerPhone || "";
    e.since = Math.min(e.since, since ?? Infinity);
    e.kind = kind;
    owedBy.set(key, e);
  };
  sales.forEach((s) => addOwed(s, saleOwed(s), "sale"));
  repairs.filter((r) => repairTotal(r) > 0 && !isOpenRepair(r)).forEach((r) => addOwed(r, repairOwed(r), "repair", t(r.readyAt) ?? t(r.updatedAt) ?? t(r.createdAt))); // owed from when the job was done
  const owed = [...owedBy.values()]
    .map((e) => ({ ...e, days: daysSince(e.since) }))
    .sort((a, b) => b.amount - a.amount);
  const owedTotal = owed.reduce((n, e) => n + e.amount, 0);

  // Finished, not collected -- longest waiting first.
  const ready = repairs
    .filter((r) => String(r.status || "").toLowerCase() === "completed")
    .map((r) => ({ id: r.id, ticket: r.ticket, name: nameOf(r), phone: r.customerPhone || "", device: r.device || "device", owed: repairOwed(r), days: daysSince(t(r.readyAt) ?? t(r.updatedAt) ?? t(r.createdAt)) }))
    .sort((a, b) => b.days - a.days);

  // On the bench a long time.
  const slow = repairs
    .filter(isOpenRepair)
    .map((r) => ({ id: r.id, ticket: r.ticket, name: nameOf(r), device: r.device || "device", status: r.status || "received", days: daysSince(t(r.createdAt)) }))
    .filter((r) => r.days >= 7)
    .sort((a, b) => b.days - a.days);

  // Out or nearly out, busiest sellers first (what sold in the last 30 days).
  const soldQty = new Map();
  sales.filter((s) => (t(s.createdAt) ?? 0) >= today - 30 * DAY).forEach((s) => (s.items || []).forEach((i) => {
    if (i.productId) soldQty.set(i.productId, (soldQty.get(i.productId) || 0) + num(i.qty));
  }));
  const low = inventory
    .filter((p) => num(p.stock) <= num(p.lowStockThreshold ?? 5))
    .map((p) => ({ id: p.id, name: p.name, stock: num(p.stock), sold30: soldQty.get(p.id) || 0 }))
    .sort((a, b) => (a.stock === 0 ? 0 : 1) - (b.stock === 0 ? 0 : 1) || b.sold30 - a.sold30 || a.stock - b.stock);

  // Today's to-do: at most five, the ones that bring money in first.
  const todo = [];
  ready.slice(0, 3).forEach((r) => todo.push({
    kind: "collect", page: "/repairs", id: r.id, phone: r.phone, name: r.name, device: r.device, ticket: r.ticket, amount: r.owed,
    text: `Remind ${firstName(r.name) || "the customer"} to collect the ${r.device}`,
    detail: `${r.days ? `Ready ${r.days} day${r.days === 1 ? "" : "s"}` : "Ready since today"}${r.owed > 0 ? " · not paid yet" : ""}${r.ticket ? ` · ${r.ticket}` : ""}`,
  }));
  // Someone already being reminded to collect (and pay for) a repair isn't asked twice.
  const remind = new Set(todo.map((x) => x.name.toLowerCase()).filter(Boolean));
  owed.filter((e) => e.days >= 3 && e.name !== "Walk-in customers" && !remind.has(e.name.toLowerCase())).slice(0, 3).forEach((e) => todo.push({
    kind: "owed", page: "/sales", phone: e.phone, name: e.name, amount: e.amount,
    text: `Ask ${firstName(e.name)} for the balance`, money: e.amount,
    detail: `Owing ${e.days} days${e.items > 1 ? ` · ${e.items} unpaid` : ""}`,
  }));
  low.filter((p) => p.stock === 0 && p.sold30 > 0).slice(0, 2).forEach((p) => todo.push({
    kind: "restock", page: "/inventory", id: p.id, name: p.name,
    text: `Restock ${p.name}`, detail: `None left · sold ${p.sold30} in the last 30 days`,
  }));
  slow.slice(0, 1).forEach((r) => todo.push({
    kind: "slow", page: "/repairs", id: r.id, name: r.name,
    text: `Check on ${r.name ? `${firstName(r.name)}'s ` : "the "}${r.device}`,
    detail: `${r.days} days on the bench · ${r.status}${r.ticket ? ` · ${r.ticket}` : ""}`,
  }));

  return {
    day: dayKey(now),
    greeting,
    empty: !sales.length && !repairs.length,
    last: { label: lastLabel, date: dayKey(lastDate), ...last, change },
    week: { ...week, lastWeek: lastWeekSoFar.total },
    owed: { total: owedTotal, people: owed.length, top: owed.slice(0, 5) },
    ready,
    slow,
    low: low.slice(0, 6),
    lowCount: low.length,
    todo: todo.slice(0, 5),
  };
}

/** The brief as plain text, to send to WhatsApp or anywhere else. */
export function briefText(b, { shop = "", money = (n) => String(Math.round(n)), showProfit = true } = {}) {
  const lines = [`*${shop ? `${shop}: ` : ""}morning brief*`, new Date(`${b.day}T12:00:00`).toDateString(), ""];
  lines.push(`${b.last.label}: ${money(b.last.total)} from ${b.last.sales} sale${b.last.sales === 1 ? "" : "s"}${b.last.repairs ? ` and ${b.last.repairs} repair${b.last.repairs === 1 ? "" : "s"}` : ""}${showProfit ? `, profit ${money(b.last.profit)}` : ""}`);
  lines.push(`This week so far: ${money(b.week.total)}`);
  if (b.owed.total > 0) lines.push(`Owed to you: ${money(b.owed.total)} by ${b.owed.people} customer${b.owed.people === 1 ? "" : "s"}`);
  if (b.ready.length) lines.push(`Ready, not collected: ${b.ready.length}`);
  if (b.lowCount) lines.push(`Running low: ${b.lowCount} product${b.lowCount === 1 ? "" : "s"}`);
  if (b.todo.length) {
    lines.push("", "*To do today*");
    b.todo.forEach((x) => lines.push(`• ${x.text}${x.money ? ` (${money(x.money)})` : ""} — ${x.detail}`));
  }
  return lines.join("\n");
}

// --------------------------------------------------------- when to show --
export function briefOff() {
  return storage.getItem(OFF_KEY) === "1";
}
export function setBriefOff(off) {
  if (off) storage.setItem(OFF_KEY, "1");
  else storage.removeItem(OFF_KEY);
}
export function markBriefSeen(now = new Date()) {
  storage.setItem(SEEN_KEY, dayKey(now));
}

/** True for the first start of the day, before 2pm, when there is something to say. */
export function briefDue(now = new Date(), brief = null) {
  if (briefOff()) return false;
  if (now.getHours() >= MORNING_ENDS_AT || now.getHours() < 4) return false;
  if (storage.getItem(SEEN_KEY) === dayKey(now)) return false;
  const b = brief || buildBrief({}, now);
  return !b.empty;
}
