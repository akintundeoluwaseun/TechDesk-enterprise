// The restock planner: what to buy, how many, and what it will cost.
//
// For every product it works out how fast it goes -- sales and parts fitted
// on repairs, the last 30 days, with the last 14 counting double so a product
// that has just picked up is noticed -- how many days the shelf will last at
// that rate, and how many to buy so the shop is covered while the order is on
// its way (lead time) and for a while after (cover). Worked out here from the
// shop's own records: no AI, no server, works offline.
import { db } from "./db";
import { storage } from "./storage";

const DAY = 86400000;
const SETTINGS_KEY = "techdesk_restock_settings";
export const DEFAULTS = { leadDays: 3, coverDays: 14, budget: null };

export function restockSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(storage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}
export function saveRestockSettings(next) {
  const clean = {
    leadDays: Math.min(60, Math.max(0, Math.round(Number(next.leadDays) || 0))),
    coverDays: Math.min(120, Math.max(1, Math.round(Number(next.coverDays) || DEFAULTS.coverDays))),
    budget: next.budget != null && Number(next.budget) > 0 ? Math.round(Number(next.budget)) : null,
  };
  storage.setItem(SETTINGS_KEY, JSON.stringify(clean));
  return clean;
}

const num = (v) => Number(v) || 0;
const time = (iso) => { const n = new Date(iso).getTime(); return Number.isFinite(n) ? n : null; };

/** Units of each product that left the shelf, per day, recent days weighted double. */
export function salesRates(sales = [], repairs = [], now = new Date()) {
  const t = now.getTime();
  const used = new Map(); // id -> { recent, older, last }
  const add = (productId, qty, at) => {
    if (!productId || !(qty > 0) || at == null) return;
    const age = (t - at) / DAY;
    if (age < 0 || age > 30) return;
    const e = used.get(productId) || { recent: 0, older: 0, last: 0 };
    if (age <= 14) e.recent += qty; else e.older += qty;
    e.last = Math.max(e.last, at);
    used.set(productId, e);
  };
  for (const s of sales) for (const i of s.items || []) add(i.productId, num(i.qty), time(s.createdAt));
  for (const r of repairs) for (const p of r.parts || []) add(p.productId, num(p.qty), time(r.createdAt));
  const rates = new Map();
  for (const [id, e] of used) {
    // 14 recent days counted twice + 16 older days once = 44 "weighted days".
    rates.set(id, { perDay: (e.recent * 2 + e.older) / 44, sold30: e.recent + e.older, lastSold: e.last });
  }
  return rates;
}

/** Everything ever sold of each product (to tell "never sold" from "stopped selling"). */
function lastSoldEver(sales = [], repairs = []) {
  const last = new Map();
  const add = (id, at) => { if (id && at != null) last.set(id, Math.max(last.get(id) || 0, at)); };
  for (const s of sales) for (const i of s.items || []) add(i.productId, time(s.createdAt));
  for (const r of repairs) for (const p of r.parts || []) add(p.productId, time(r.createdAt));
  return last;
}

/**
 * The plan. Each line: {id, name, stock, cost, price, perWeek, daysLeft,
 * suggest, status, reason}. status is "out" (none left and it sells),
 * "now" (runs out before an order would arrive), "soon" (within a week
 * after that), "low" (under its low-stock mark but hardly selling), or
 * "ok". `idle` lists stock that hasn't sold in 60 days -- money on the shelf.
 */
export function buildRestockPlan(data = {}, now = new Date(), settings = restockSettings()) {
  const inventory = data.inventory || db.getInventory();
  const sales = data.sales || db.getSales();
  const repairs = data.repairs || db.getRepairs();
  const { leadDays, coverDays } = { ...DEFAULTS, ...settings };
  const rates = salesRates(sales, repairs, now);
  const ever = lastSoldEver(sales, repairs);
  const t = now.getTime();

  const lines = [];
  const idle = [];
  for (const p of inventory) {
    const stock = Math.max(0, num(p.stock));
    const r = rates.get(p.id);
    const perDay = r?.perDay || 0;
    const threshold = num(p.lowStockThreshold ?? 5);
    const daysLeft = perDay > 0 ? stock / perDay : null;
    let status = "ok";
    let suggest = 0;
    let reason = "";
    if (perDay > 0) {
      const need = Math.ceil(perDay * (leadDays + coverDays));
      suggest = Math.max(0, need - stock);
      if (stock === 0) { status = "out"; reason = "None left, and it sells"; }
      else if (daysLeft <= leadDays) { status = "now"; reason = `Runs out in ${Math.max(1, Math.round(daysLeft))} day${Math.round(daysLeft) === 1 ? "" : "s"}, before a new order would arrive`; }
      else if (daysLeft <= leadDays + 7) { status = "soon"; reason = `About ${Math.round(daysLeft)} days left`; }
      else suggest = 0;
    }
    if (status === "ok" && stock <= threshold && threshold > 0 && perDay === 0) {
      // Below its low-stock mark but not moving: bring it back up to the mark, no more.
      status = "low";
      suggest = Math.max(0, threshold - stock);
      reason = stock === 0 ? "None left; hasn't sold in the last 30 days" : "Below its low-stock mark; selling slowly";
    }
    const line = {
      id: p.id, name: p.name, category: p.category || "", stock, threshold,
      cost: num(p.costPrice), price: num(p.price),
      perWeek: Math.round(perDay * 7 * 10) / 10, sold30: r?.sold30 || 0, daysLeft: daysLeft == null ? null : Math.round(daysLeft),
      suggest, status, reason,
    };
    if (status !== "ok") lines.push(line);

    const lastAt = ever.get(p.id) || time(p.createdAt) || 0;
    if (stock > 0 && perDay === 0 && t - lastAt > 60 * DAY) {
      idle.push({ id: p.id, name: p.name, stock, value: stock * num(p.costPrice), days: lastAt ? Math.floor((t - lastAt) / DAY) : null, neverSold: !ever.has(p.id) });
    }
  }

  const ORDER = { out: 0, now: 1, soon: 2, low: 3 };
  const margin = (l) => (l.price > 0 ? (l.price - l.cost) / l.price : 0);
  lines.sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.perWeek - a.perWeek || margin(b) - margin(a));
  idle.sort((a, b) => b.value - a.value);
  return { lines, idle, idleValue: idle.reduce((n, x) => n + x.value, 0), settings: { leadDays, coverDays } };
}

/**
 * Fits the order to a budget, most urgent first (then busiest, then best
 * margin): whole lines while they fit, then as many of the next as the money
 * left will buy. Returns the quantities, keyed by product id.
 */
export function fitToBudget(lines, qty, budget) {
  const out = { ...qty };
  if (!(budget > 0)) return out;
  let left = budget;
  for (const l of lines) {
    const want = out[l.id] ?? l.suggest;
    if (!(want > 0)) continue;
    if (!(l.cost > 0)) continue; // no cost on record: can't price it, leave it as is
    const can = Math.min(want, Math.floor(left / l.cost));
    out[l.id] = Math.max(0, can);
    left -= out[l.id] * l.cost;
  }
  return out;
}

export function orderTotal(lines, qty) {
  return lines.reduce((n, l) => n + num(qty[l.id] ?? l.suggest) * l.cost, 0);
}

/** The order as a message for a supplier: names and quantities only, no prices. */
export function orderText(lines, qty, { shop = "" } = {}) {
  const rows = lines.filter((l) => num(qty[l.id] ?? l.suggest) > 0).map((l) => `• ${l.name} × ${num(qty[l.id] ?? l.suggest)}`);
  return [`Hello, ${shop ? `this is ${shop}. ` : ""}I'd like to order:`, "", ...rows, "", "Please confirm the total and when it can be ready. Thank you."].join("\n");
}

/**
 * The goods have arrived: add each quantity to stock (and the new cost each,
 * if one was given). Returns {added, undo}.
 */
export function receiveOrder(lines, qty, { costs = {}, actor } = {}) {
  const undo = [];
  let added = 0;
  for (const l of lines) {
    const n = Math.round(num(qty[l.id] ?? 0));
    if (!(n > 0)) continue;
    const before = db.findInventoryItem(l.id);
    if (!before) continue;
    const patch = { stock: num(before.stock) + n };
    if (costs[l.id] != null && num(costs[l.id]) > 0) patch.costPrice = num(costs[l.id]);
    db.updateInventoryItem(l.id, patch);
    db.logActivity({ type: "inventory", message: `Restocked ${n} × ${before.name}`, refId: l.id, actor });
    undo.unshift(() => db.updateInventoryItem(l.id, { stock: before.stock, costPrice: before.costPrice }));
    added += 1;
  }
  return { added, undo };
}

export function runRestockUndo(undo) {
  for (const step of undo || []) {
    try { step(); } catch { /* changed since: leave it */ }
  }
}
