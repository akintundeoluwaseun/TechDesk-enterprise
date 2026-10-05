// Answers to questions asked by voice or typed into the assistant.
//
// The AI only says WHAT was asked ("profit", "this week", "Chidi"); the
// numbers are worked out here, from this device's own records, the same way
// the Reports page works them out. Nothing about the shop's sales, customers
// or stock is sent anywhere to answer a question.
import { db } from "./db";
import { saleOwed, repairOwed, repairTotal, isOpenRepair } from "./summary";
import { matchCustomer, matchProduct } from "./voiceOrder";

const DAY = 86400000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** [start, end) for a spoken period, in the shop's own time. */
export function periodRange(period, now = new Date()) {
  const today = startOfDay(now);
  const add = (d, n) => new Date(d.getTime() + n * DAY);
  const monday = add(today, -((today.getDay() + 6) % 7));
  switch (period) {
    case "yesterday": return [add(today, -1), today];
    case "this_week": return [monday, add(today, 1)];
    case "last_week": return [add(monday, -7), monday];
    case "this_month": return [new Date(today.getFullYear(), today.getMonth(), 1), add(today, 1)];
    case "last_month": return [new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 1)];
    case "this_year": return [new Date(today.getFullYear(), 0, 1), add(today, 1)];
    case "all_time": return [new Date(0), add(today, 1)];
    default: return [today, add(today, 1)];
  }
}

export const PERIOD_LABEL = {
  today: "today", yesterday: "yesterday", this_week: "this week", last_week: "last week",
  this_month: "this month", last_month: "last month", this_year: "this year", all_time: "all time",
};

const inRange = ([a, b]) => (r) => { const t = new Date(r.createdAt).getTime(); return t >= a.getTime() && t < b.getTime(); };
const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function itemCost(item) {
  if (item.costPrice != null && item.costPrice !== "") return Number(item.costPrice || 0) * Number(item.qty || 0);
  const p = item.productId ? db.findInventoryItem(item.productId) : null;
  return p ? Number(p.costPrice || 0) * Number(item.qty || 0) : 0;
}

/**
 * {title, lines: [{label, value, money}], empty?} -- value is a number when
 * money is true, otherwise text. `empty` is the sentence to show when there's
 * nothing to list.
 */
export function answerQuestion({ intent, period, subject, note } = {}, data = {}, now = new Date()) {
  const sales = data.sales || db.getSales();
  const repairs = data.repairs || db.getRepairs();
  const inventory = data.inventory || db.getInventory();
  const customers = data.customers || db.getCustomers();
  const p = period || (["who_owes", "customer_balance", "low_stock", "stock_of", "repairs_open", "repairs_ready"].includes(intent) ? "all_time" : "today");
  const when = PERIOD_LABEL[p] || "today";
  const range = periodRange(p, now);
  const S = sales.filter(inRange(range));
  const R = repairs.filter(inRange(range));
  const money = (label, value) => ({ label, value: Math.round(value), money: true });
  const text = (label, value) => ({ label, value: String(value), money: false });

  switch (intent) {
    case "sales_total": {
      const total = S.reduce((n, s) => n + Number(s.total || 0), 0);
      const owed = S.reduce((n, s) => n + saleOwed(s), 0);
      return { title: `Sales ${when}`, lines: [money("Sold", total), text("Sales", S.length), money("Paid", total - owed), money("Still owed", owed)] };
    }
    case "profit": {
      const revenue = S.reduce((n, s) => n + Number(s.total || 0), 0);
      const cost = S.reduce((n, s) => n + (s.items || []).reduce((m, i) => m + itemCost(i), 0), 0);
      const labour = R.filter((r) => ["completed", "delivered"].includes(r.status)).reduce((n, r) => n + Number(r.repairCost || 0), 0);
      return {
        title: `Profit ${when}`,
        lines: [money("Profit", revenue + labour - cost), money("Sales", revenue), money("Repairs done", labour), money("Cost of goods sold", cost)],
      };
    }
    case "top_products": {
      const map = new Map();
      S.forEach((s) => (s.items || []).forEach((i) => {
        const e = map.get(i.name) || { qty: 0, revenue: 0 };
        e.qty += Number(i.qty || 0); e.revenue += Number(i.price || 0) * Number(i.qty || 0);
        map.set(i.name, e);
      }));
      const top = [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
      return { title: `Best sellers ${when}`, lines: top.map(([name, e]) => money(`${name} × ${e.qty}`, e.revenue)), empty: `Nothing sold ${when}.` };
    }
    case "who_owes": {
      const by = new Map();
      // A job still on the bench isn't owed yet -- the same rule as the money chaser.
      [...sales.map((s) => [s.customerName || "Walk-in", saleOwed(s)]), ...repairs.filter((r) => !isOpenRepair(r)).map((r) => [r.customerName || "Walk-in", repairOwed(r)])]
        .filter(([, v]) => v > 0).forEach(([n, v]) => by.set(n, (by.get(n) || 0) + v));
      const list = [...by.entries()].sort((a, b) => b[1] - a[1]);
      const total = list.reduce((n, [, v]) => n + v, 0);
      return { title: "Who owes you", lines: [money("Total owed", total), ...list.slice(0, 8).map(([n, v]) => money(n, v))], empty: "Nobody owes you. 🎉" };
    }
    case "customer_balance": {
      const m = matchCustomer(subject, null, customers);
      const name = m.customer?.name || subject || "";
      const first = words(name)[0];
      const mine = (r) => (m.customer && r.customerId === m.customer.id) || (first && words(r.customerName).includes(first));
      const owed = sales.filter(mine).reduce((n, s) => n + saleOwed(s), 0) + repairs.filter(mine).filter((r) => !isOpenRepair(r)).reduce((n, r) => n + repairOwed(r), 0);
      const open = repairs.filter(mine).filter(isOpenRepair).length;
      if (!first) return { title: "Which customer?", lines: [], empty: "Say the customer's name, like “How much does Chidi owe?”" };
      return { title: name, lines: [money("Owes", owed), text("Open repairs", open), text("Times bought", sales.filter(mine).length)] };
    }
    case "low_stock": {
      const low = inventory.filter((i) => Number(i.stock || 0) <= Number(i.lowStockThreshold ?? 5)).sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));
      return { title: "Running low", lines: low.slice(0, 10).map((i) => text(i.name, `${Number(i.stock || 0)} left`)), empty: "Nothing is running low." };
    }
    case "stock_of": {
      const m = matchProduct(subject, inventory);
      const list = m.product ? [m.product] : m.candidates;
      return { title: subject ? `Stock: ${subject}` : "Which product?", lines: list.map((i) => text(i.name, `${Number(i.stock || 0)} left`)), empty: `“${subject || ""}” isn't in your stock.` };
    }
    case "repairs_open": {
      const open = repairs.filter(isOpenRepair);
      const by = {};
      open.forEach((r) => { by[r.status || "received"] = (by[r.status || "received"] || 0) + 1; });
      return { title: "On the bench", lines: [text("Open repairs", open.length), ...Object.entries(by).map(([k, v]) => text(k, v))], empty: "No open repairs." };
    }
    case "repairs_ready": {
      const ready = repairs.filter((r) => r.status === "completed").sort((a, b) => String(a.readyAt || a.updatedAt || a.createdAt).localeCompare(String(b.readyAt || b.updatedAt || b.createdAt)));
      return {
        title: "Done, not collected",
        lines: ready.slice(0, 10).map((r) => {
          const days = Math.floor((now - new Date(r.readyAt || r.updatedAt || r.createdAt)) / DAY);
          return text(`${r.ticket} · ${r.customerName} · ${r.device}`, days > 0 ? `${days}d waiting` : "today");
        }),
        empty: "Every finished repair has been collected.",
      };
    }
    case "worker_sales": {
      const by = new Map();
      S.forEach((s) => { const k = s.actor || "Admin"; const e = by.get(k) || { n: 0, total: 0 }; e.n += 1; e.total += Number(s.total || 0); by.set(k, e); });
      let list = [...by.entries()];
      if (subject) list = list.filter(([k]) => words(k).some((w) => words(subject).includes(w)));
      return { title: `Sales by staff ${when}`, lines: list.sort((a, b) => b[1].total - a[1].total).map(([k, e]) => money(`${k} (${e.n})`, e.total)), empty: subject ? `${subject} has no sales ${when}.` : `No sales ${when}.` };
    }
    case "best_customers": {
      const by = new Map();
      [...S.map((s) => [s.customerName, Number(s.total || 0)]), ...R.map((r) => [r.customerName, repairTotal(r)])]
        .filter(([n]) => n && n !== "Walk-in").forEach(([n, v]) => by.set(n, (by.get(n) || 0) + v));
      return { title: `Best customers ${when}`, lines: [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, v]) => money(n, v)), empty: `No named customers ${when}.` };
    }
    default:
      return { title: "I can't answer that yet", lines: [], empty: `Try: “How much did I sell today?”, “Who owes me?”, “What's running low?”${note ? `\n(You asked: ${note})` : ""}` };
  }
}

// ------------------------------------------------------------ instant ----
// Questions a shop asks all day, recognised here without asking the AI:
// answered the moment they're said, offline, and without using a turn.
// Anything that isn't plainly one of these goes to the AI as before.
const PERIOD_WORDS = [
  [/\byesterday\b/, "yesterday"], [/\blast week\b/, "last_week"], [/\bthis week\b|\bthe week\b/, "this_week"],
  [/\blast month\b/, "last_month"], [/\bthis month\b|\bthe month\b/, "this_month"], [/\bthis year\b/, "this_year"],
  [/\ball time\b|\bever\b|\bsince (i|we) (started|opened)\b/, "all_time"], [/\btoday\b|\bso far\b/, "today"],
];
const periodIn = (t) => (PERIOD_WORDS.find(([re]) => re.test(t)) || [])[1] || null;

/** {intent, period, subject} for a question asked in plain words, or null. */
export function quickIntent(text) {
  const t = ` ${String(text || "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ")} `;
  if (!t.trim()) return null;
  // Telling the app to do something is never a quick question.
  if (/\b(sell|sold to|add|record|book|mark|cancel|change|delete|return(ed)?|paid|pay|refund)\b/.test(t) && !/\bhow much\b|\bwhat\b|\bwho\b|\bwhich\b/.test(t)) return null;
  const period = periodIn(t);
  let m;
  if ((m = t.match(/\bhow much (?:does|is|do) ([a-z]+(?: [a-z]+)?) ow(?:e|ing)\b/)) || (m = t.match(/\bwhat (?:does|is) ([a-z]+(?: [a-z]+)?) ow(?:e|ing)\b/))) {
    return { intent: "customer_balance", subject: m[1].replace(/\b(me|us)\b/g, "").trim(), period: null };
  }
  if (/\bwho (is |are )?ow(e|es|ing)\b|\bdebtors?\b|\bpeople owing\b/.test(t)) return { intent: "who_owes", period: null };
  if (/\bprofit\b|\bgain\b/.test(t)) return { intent: "profit", period: period || "today" };
  if (/\b(running|finishing|going) (low|out)\b|\blow stock\b|\bwhat.*(finish|remain)/.test(t)) return { intent: "low_stock", period: null };
  if (/\bready\b.*\b(collect|pick ?up|not collected)\b|\bnot (yet )?collected\b|\bwaiting (to be|for) (collect|pick)/.test(t)) return { intent: "repairs_ready", period: null };
  if (/\b(open|pending) repairs?\b|\bon the bench\b|\brepairs? (in progress|pending)\b/.test(t)) return { intent: "repairs_open", period: null };
  if (/\bbest[- ]sell|\bselling (the )?most\b|\btop (selling|products?|items?)\b|\bwhat sells\b/.test(t)) return { intent: "top_products", period: period || "this_month" };
  if (/\bbest customers?\b|\btop customers?\b|\bwho buys? (the )?most\b/.test(t)) return { intent: "best_customers", period: period || "this_month" };
  if ((m = t.match(/\bhow many ([a-z0-9][a-z0-9 ]*?) (?:do i have|are left|remain|in stock|left)\b/))) return { intent: "stock_of", subject: m[1].trim(), period: null };
  if (/\bhow much (did|have) (i|we) (sell|sold|make|made)\b|\bhow much (sales|money)\b|\b(my |total )?sales (for |of )?(today|yesterday|this|last)\b|\bwhat did (i|we) (sell|make)\b/.test(t)) {
    return { intent: "sales_total", period: period || "today" };
  }
  return null;
}
