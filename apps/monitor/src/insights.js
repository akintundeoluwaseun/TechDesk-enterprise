// Monitor's assistant: what head office asked, and the answer, from the
// figures the server adds up (hq_insights, migration 0045).
//
// Questions are understood here first -- "sales today", "which branch sold
// most this week", "who owes us", "how far Ikeja" -- which is instant and free.
// Anything this doesn't recognise is sent to the AI (voice-order, text only)
// just to find out WHAT was asked; the answer is still worked out here, from
// the same figures, so the AI never makes up a number.
//
// Days are Lagos days, matching the server ("today" comes from it too).

const DAY = 24 * 60 * 60 * 1000;
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (day, n) => iso(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY));
const weekday = (day) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0

export const PERIODS = {
  today: { label: "today" },
  yesterday: { label: "yesterday" },
  week: { label: "this week" },
  last_week: { label: "last week" },
  month: { label: "this month" },
  last_month: { label: "last month" },
  "7d": { label: "the last 7 days" },
  "30d": { label: "the last 30 days" },
};

/** [from, to] (inclusive, YYYY-MM-DD) for a period, ending on `today`. */
export function range(period, today) {
  switch (period) {
    case "yesterday": { const y = addDays(today, -1); return [y, y]; }
    case "week": return [addDays(today, -weekday(today)), today];
    case "last_week": { const mon = addDays(today, -weekday(today) - 7); return [mon, addDays(mon, 6)]; }
    case "month": return [`${today.slice(0, 8)}01`, today];
    case "last_month": {
      const first = `${today.slice(0, 8)}01`;
      const end = addDays(first, -1);
      return [`${end.slice(0, 8)}01`, end];
    }
    case "7d": return [addDays(today, -6), today];
    case "30d": return [addDays(today, -29), today];
    default: return [today, today];
  }
}

/** The period before, the same length, for "up 12% on ...". */
function previous(period, today) {
  const [from, to] = range(period, today);
  if (period === "month") {
    const [pf] = range("last_month", today);
    return [pf, addDays(pf, Number(to.slice(8)) - 1)];
  }
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  return [addDays(from, -days), addDays(from, -1)];
}

export function parsePeriod(text) {
  const t = ` ${String(text || "").toLowerCase()} `;
  if (/yesterday|yesterdey|yestaday/.test(t)) return "yesterday";
  if (/last week|past week|previous week/.test(t)) return "last_week";
  if (/this week|for the week|weekly|\bweek\b/.test(t)) return "week";
  if (/last month|previous month/.test(t)) return "last_month";
  if (/this month|for the month|monthly|\bmonth\b/.test(t)) return "month";
  if (/7 days|seven days/.test(t)) return "7d";
  if (/30 days|thirty days/.test(t)) return "30d";
  if (/today|todey|tday|so far|this morning|now\b/.test(t)) return "today";
  return null;
}

/** A branch named in the question, by its name or the first word of it. */
export function parseBranch(text, branches = []) {
  const t = ` ${String(text || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ")} `;
  const sorted = [...branches].sort((a, b) => String(b.name).length - String(a.name).length);
  for (const b of sorted) {
    const name = String(b.name || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim();
    if (name && t.includes(` ${name} `)) return b;
  }
  for (const b of sorted) {
    const first = String(b.name || "").toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]+/g, "");
    if (first.length >= 3 && new RegExp(`\\b${first}\\b`).test(t)) return b;
  }
  return null;
}

/** What was asked: {intent, period, branch}. intent null = not recognised. */
export function parseQuestion(text, branches = []) {
  const t = String(text || "").toLowerCase();
  const period = parsePeriod(t);
  const branch = parseBranch(t, branches);
  let intent = null;
  if (/\b(owe|owes|owing|debt|debtor|unpaid|balance|credit)\b|dem owe|never pay|not paid/.test(t)) intent = "owed";
  else if (/\bprofit|\bgain\b|margin|wetin we gain/.test(t)) intent = "profit";
  else if (/which branch|best branch|top branch|branch.*(most|best|highest|least|worst)|compare|all (the )?branches|each branch|every branch|per branch/.test(t)) intent = "branches";
  else if (/best.?sell|top (product|item|selling)|selling (most|well|fast)|fast.?moving|most sold|wetin (dey|they) sell/.test(t)) intent = "top";
  else if (/low stock|running low|finish(ing|ed)?|out of stock|restock|stock\b/.test(t)) intent = "stock";
  else if (/repair|ready|pick ?up|collect|bench|ticket/.test(t)) intent = "repairs";
  else if (/summary|brief|overview|how far|how is (the )?(business|shop|branch)|how (we|una) dey|how are we doing|update me|how (the )?(market|business|sales|shop|branch|things) (dey|de|is|go|going)|wetin dey happen|how e dey go/.test(t)) intent = "brief";
  else if (/\b(sale|sales|sold|sell|revenue|turnover|income|money|made|make|takings|bring)\b|how much/.test(t)) intent = "sales";
  else if (branch) intent = "brief";
  return { intent, period, branch };
}

/** The AI's reading of a question (voice-order's question intents) as ours. */
export function fromAi(action, branches = []) {
  const map = {
    sales_total: "sales", profit: "profit", top_products: "top", who_owes: "owed", customer_balance: "owed",
    low_stock: "stock", stock_of: "stock", repairs_open: "repairs", repairs_ready: "repairs",
    worker_sales: "sales", best_customers: "owed",
  };
  const intent = map[action?.intent] || null;
  const words = [action?.subject, action?.period, action?.note].filter(Boolean).join(" ");
  const period = parsePeriod(words) || ({ today: "today", yesterday: "yesterday", week: "week", this_week: "week", month: "month", this_month: "month" })[action?.period] || null;
  return { intent, period, branch: parseBranch(words, branches) };
}

function totals(ins, [from, to], branchId) {
  const out = { revenue: 0, profit: 0, sales: 0, repairs: 0, salesRevenue: 0, repairRevenue: 0 };
  for (const d of ins?.days || []) {
    if (d.day < from || d.day > to) continue;
    if (branchId && d.branch !== branchId) continue;
    for (const k of Object.keys(out)) out[k] += Number(d[k]) || 0;
  }
  return out;
}

function change(now, before) {
  if (!(before > 0)) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? "the same as" : pct > 0 ? `up ${pct}% on` : `down ${-pct}% on`;
}

const branchName = (ins, id) => (ins?.branches || []).find((b) => b.id === id)?.name || "A branch";
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The answer: {title, figure, sub, rows: [{label, value, note}], tip}.
 * money(n) formats an amount in the owner's currency (currency.js).
 */
export function answer(q, ins, money, extra = {}) {
  if (!ins?.ok) return { title: "No figures yet", sub: "Monitor couldn't load the branches' figures. Pull to refresh, then ask again." };
  const today = ins.today;
  const period = q.period || (q.intent === "owed" || q.intent === "stock" || q.intent === "repairs" ? null : "today");
  const where = q.branch ? ` at ${q.branch.name}` : "";
  const when = period ? PERIODS[period].label : "";
  const id = q.branch?.id || null;

  switch (q.intent) {
    case "sales":
    case "profit": {
      const r = range(period, today);
      const now = totals(ins, r, id);
      const before = totals(ins, previous(period, today), id);
      const key = q.intent === "profit" ? "profit" : "revenue";
      const c = change(now[key], before[key]);
      const rows = id ? [] : (ins.branches || [])
        .map((b) => ({ b, v: totals(ins, r, b.id)[key] }))
        .sort((a, z) => z.v - a.v)
        .map(({ b, v }) => ({ label: b.name, value: money(v) }));
      return {
        title: `${q.intent === "profit" ? "Profit" : "Sales"}${where} ${when}`,
        figure: money(now[key]),
        sub: [
          q.intent === "profit" ? `on ${money(now.revenue)} taken` : `${plural(now.sales, "sale")}${now.repairs ? ` and ${plural(now.repairs, "repair")}` : ""}`,
          c ? `${c} the period before` : null,
        ].filter(Boolean).join(" · "),
        rows: rows.length > 1 ? rows : [],
      };
    }
    case "branches": {
      const r = range(period, today);
      const list = (ins.branches || []).map((b) => ({ b, t: totals(ins, r, b.id) })).sort((a, z) => z.t.revenue - a.t.revenue);
      if (!list.length) return { title: "No branches yet", sub: "Connect a branch to head office and it shows up here." };
      const top = list[0];
      return {
        title: `Branches ${when}`,
        figure: top.t.revenue > 0 ? top.b.name : "No sales yet",
        sub: top.t.revenue > 0 ? `sold the most: ${money(top.t.revenue)}` : `Nothing recorded ${when} at any branch.`,
        rows: list.map(({ b, t }) => ({ label: b.name, value: money(t.revenue), note: `${plural(t.sales, "sale")} · profit ${money(t.profit)}` })),
      };
    }
    case "owed": {
      const list = (ins.owed || []).filter((o) => !id || o.branch === id);
      const sum = list.reduce((n, o) => n + (Number(o.amount) || 0), 0);
      if (!list.length) return { title: `Owed${where}`, figure: money(0), sub: "Nobody owes anything. 🎉" };
      return {
        title: `Owed to you${where}`,
        figure: money(sum),
        sub: `by ${plural(list.length, "customer")}`,
        rows: list.slice(0, 8).map((o) => ({
          label: o.customer || (o.kind === "repair" ? "A repair customer" : "Walk-in"),
          value: money(o.amount),
          note: `${id ? "" : `${branchName(ins, o.branch)} · `}${o.kind === "repair" ? "repair" : "sale"}${o.number ? ` ${o.number}` : ""} · since ${o.since}`,
        })),
        tip: list.length > 8 ? `And ${list.length - 8} more.` : undefined,
      };
    }
    case "repairs": {
      const list = (ins.repairs || []).filter((r) => !id || r.branch === id);
      const open = list.reduce((n, r) => n + (Number(r.open) || 0), 0);
      const ready = list.reduce((n, r) => n + (Number(r.ready) || 0), 0);
      return {
        title: `Repairs${where}`,
        figure: `${open} open`,
        sub: `${plural(ready, "job")} ready, waiting to be collected`,
        rows: id ? [] : list.map((r) => ({ label: branchName(ins, r.branch), value: `${r.open} open`, note: `${r.ready} ready · ${r.today} booked today` })),
      };
    }
    case "stock": {
      const list = (ins.lowStock || []).filter((s) => !id || s.branch === id);
      if (!list.length) return { title: `Stock${where}`, figure: "All good", sub: "Nothing is at or under its low-stock mark." };
      return {
        title: `Running low${where}`,
        figure: plural(list.length, "product"),
        sub: `${list.filter((s) => Number(s.stock) <= 0).length} already out`,
        rows: list.slice(0, 10).map((s) => ({ label: s.name, value: `${s.stock} left`, note: id ? undefined : branchName(ins, s.branch) })),
      };
    }
    case "top": {
      const list = ins.top || [];
      if (!list.length) return { title: "Best sellers", figure: "None yet", sub: "No sales in the last 30 days." };
      return {
        title: "Best sellers, last 30 days",
        figure: list[0].name,
        sub: `${list[0].qty} sold across all branches`,
        rows: list.slice(0, 8).map((p) => ({ label: p.name, value: `${p.qty} sold`, note: money(p.revenue) })),
      };
    }
    case "brief":
      return brief(ins, money, extra, q.branch);
    default:
      return {
        title: "I can answer these",
        sub: "Ask about sales, profit, which branch is doing best, who owes you, repairs, stock or best sellers -- for today, yesterday, this week or this month, for one branch or all.",
      };
  }
}

/** The daily summary: yesterday, today so far, what needs a look. */
export function brief(ins, money, extra = {}, branch = null) {
  const today = ins.today;
  const id = branch?.id || null;
  const y = totals(ins, range("yesterday", today), id);
  const dayBefore = totals(ins, [addDays(today, -2), addDays(today, -2)], id);
  const t = totals(ins, range("today", today), id);
  const week = totals(ins, range("week", today), id);
  const c = change(y.revenue, dayBefore.revenue);
  const best = id ? null : (ins.branches || []).map((b) => ({ b, t: totals(ins, range("yesterday", today), b.id) })).sort((a, z) => z.t.revenue - a.t.revenue)[0];
  const owed = (ins.owed || []).filter((o) => !id || o.branch === id);
  const owedSum = owed.reduce((n, o) => n + (Number(o.amount) || 0), 0);
  const ready = (ins.repairs || []).filter((r) => !id || r.branch === id).reduce((n, r) => n + (Number(r.ready) || 0), 0);
  const low = (ins.lowStock || []).filter((s) => !id || s.branch === id);
  const rows = [
    { label: "Yesterday", value: money(y.revenue), note: `profit ${money(y.profit)}${c ? ` · ${c} the day before` : ""}` },
    { label: "Today so far", value: money(t.revenue), note: plural(t.sales, "sale") },
    { label: "This week", value: money(week.revenue), note: `profit ${money(week.profit)}` },
  ];
  if (best && best.t.revenue > 0) rows.push({ label: "Best branch yesterday", value: best.b.name, note: money(best.t.revenue) });
  if (owedSum > 0) rows.push({ label: "Owed to you", value: money(owedSum), note: owed.slice(0, 3).map((o) => o.customer || "Walk-in").join(", ") });
  if (ready > 0) rows.push({ label: "Repairs ready", value: `${ready}`, note: "waiting to be collected" });
  if (low.length) rows.push({ label: "Running low", value: `${low.length}`, note: low.slice(0, 3).map((s) => s.name).join(", ") });
  if (extra.offline > 0) rows.push({ label: "Devices to check", value: `${extra.offline}`, note: "haven't reported in for 10+ minutes" });
  return { title: branch ? `${branch.name} at a glance` : "Your day at a glance", figure: money(y.revenue), sub: `taken yesterday${branch ? ` at ${branch.name}` : " across all branches"}`, rows };
}
