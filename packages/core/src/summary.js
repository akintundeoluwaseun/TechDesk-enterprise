// The numbers the top of each page reports.
//
// Every one of these was either missing or counting the wrong thing. The
// inventory said "4 in stock" and meant four LINES in the list; repairs and
// customers said nothing at all; sales said "340 total transactions", which
// is true and is not what anybody opens the app to find out.
//
// What a shop wants at a glance is TODAY -- what has come in, what is still
// owed, what is on the shelf -- so today leads, and the running totals come
// after it.
//
// They live here rather than in the pages because three screens and an
// export have to agree about what a repair costs and what a customer has
// spent. When that arithmetic sat in the components, it could only agree by
// coincidence.

/** Start of the day `now` falls in, on this device's own clock. */
export function startOfDay(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Was this written today?
 *
 * Local midnight, not UTC. A shop in Lagos closing at 9pm is an hour ahead of
 * UTC, so a UTC day would roll over while they were still trading and put the
 * evening's work under tomorrow.
 */
export function isToday(iso, now = new Date()) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= startOfDay(now).getTime() && t <= new Date(now).getTime() + 1000;
}

/** Monday of the week `now` falls in, on this device's own clock. */
export function startOfWeek(now = new Date()) {
  const d = startOfDay(now);
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const sinceMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - sinceMonday);
  return d;
}

/** The 1st of the month `now` falls in, on this device's own clock. */
export function startOfMonth(now = new Date()) {
  const d = startOfDay(now);
  d.setDate(1);
  return d;
}

const PERIOD_BUCKETS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "older", label: "Older" },
];

/**
 * Sales and repairs, split into Today / This Week / This Month / Older --
 * a list that only grows read fine at ten rows and became a scroll of
 * identical-looking cards at two hundred, with nothing on the page to say
 * where "today" ended and last month began.
 *
 * `records` is expected newest-first, same order db.getSales()/getRepairs()
 * already return it in (they unshift onto save) -- this only partitions,
 * it never re-sorts, so that order is kept inside each bucket. Empty
 * buckets are left out entirely rather than returned as a heading with
 * nothing under it.
 */
export function groupByPeriod(records = [], now = new Date()) {
  const today = startOfDay(now).getTime();
  const week = startOfWeek(now).getTime();
  const month = startOfMonth(now).getTime();

  const buckets = { today: [], week: [], month: [], older: [] };

  for (const record of records) {
    const t = new Date(record?.createdAt).getTime();
    if (!Number.isFinite(t)) buckets.older.push(record);
    else if (t >= today) buckets.today.push(record);
    else if (t >= week) buckets.week.push(record);
    else if (t >= month) buckets.month.push(record);
    else buckets.older.push(record);
  }

  return PERIOD_BUCKETS.map((b) => ({ ...b, items: buckets[b.key] })).filter((b) => b.items.length > 0);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * What a repair comes to: labour plus the parts that went into it.
 *
 * repairCost is LABOUR only -- the modal says so in as many words -- so
 * reading it as the bill under-reports every job that used a part, which is
 * most of them.
 */
export function repairTotal(repair) {
  const parts = Array.isArray(repair?.parts) ? repair.parts : [];
  return num(repair?.repairCost) + parts.reduce((sum, p) => sum + num(p?.price) * num(p?.qty), 0);
}

/** Still to be collected on this job. */
export function repairOwed(repair) {
  // Partial is the awkward one: the app records that something was paid but
  // not how much, so the honest answer is "some of it". Counting it as fully
  // paid would under-state what the shop is owed, and counting it as unpaid
  // would over-state it -- and a shop chasing money would rather be told the
  // larger figure and find one already settled than the smaller and be short.
  if (repair?.paymentStatus === "Paid") return 0;
  // Part-payments recorded with an amount (the money chaser records them)
  // say how much is left; older "Partial" jobs without one still read as
  // the whole bill, for the reason above.
  const paid = num(repair?.amountPaid);
  return Math.max(0, repairTotal(repair) - paid);
}

/**
 * Still to be collected on this sale. Same reasoning as repairOwed: a sale
 * marked "Partial" recorded that something was paid, not how much, so this
 * reads amountPaid against the total rather than treating "not fully paid"
 * as "none of it paid" -- a sale for 20,000 with 15,000 already in is owed
 * 5,000, not 20,000.
 */
export function saleOwed(sale) {
  if (sale?.paymentStatus === "Paid") return 0;
  return Math.max(0, num(sale?.total) - num(sale?.amountPaid));
}

const DONE = new Set(["completed", "delivered"]);

/** Is this job still on the bench? */
export function isOpenRepair(repair) {
  return !DONE.has(String(repair?.status || "").toLowerCase());
}

export function repairsSummary(repairs = [], now = new Date()) {
  let open = 0;
  let inToday = 0;
  let ready = 0;
  let owed = 0;

  for (const r of repairs) {
    if (isOpenRepair(r)) open += 1;
    if (isToday(r?.createdAt, now)) inToday += 1;
    // Done, but still on the shelf. The one a shop most wants counted: it is
    // finished work nobody has come for, and it is money sitting in a drawer.
    if (String(r?.status || "").toLowerCase() === "completed") ready += 1;
    owed += repairOwed(r);
  }

  return { total: repairs.length, open, inToday, ready, owed };
}

export function salesSummary(sales = [], now = new Date()) {
  let today = 0;
  let todayTotal = 0;
  let allTotal = 0;
  let owed = 0;

  for (const s of sales) {
    const total = num(s?.total);
    allTotal += total;
    if (isToday(s?.createdAt, now)) {
      today += 1;
      todayTotal += total;
    }
    owed += saleOwed(s);
  }

  return { total: sales.length, today, todayTotal, allTotal, owed };
}

/**
 * How a sale or a repair is matched to a customer.
 *
 * The phone number where there is one, because that is what the shop types
 * and what findOrCreateCustomer already matches on. A name is the fallback,
 * lowercased and trimmed, so "Ade" and "ade " are one person rather than two.
 */
export function customerKey(record) {
  const phone = String(record?.phone || record?.customerPhone || "").replace(/\s/g, "");
  if (phone) return `p:${phone}`;
  const name = String(record?.name || record?.customerName || "").trim().toLowerCase();
  return name ? `n:${name}` : "";
}

/**
 * What each customer has bought and brought in.
 *
 * Returns a Map keyed by customerKey. Built once per render for the whole
 * list rather than per row: a shop with 400 customers and 4,000 sales would
 * otherwise walk the sales list 400 times to draw one screen.
 */
export function customerTotals(sales = [], repairs = []) {
  const map = new Map();

  function entry(key) {
    if (!map.has(key)) {
      map.set(key, { sales: 0, repairs: 0, spent: 0, owed: 0, lastAt: null });
    }
    return map.get(key);
  }

  function seen(row, iso) {
    if (!iso) return;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return;
    if (!row.lastAt || t > new Date(row.lastAt).getTime()) row.lastAt = iso;
  }

  for (const s of sales) {
    const key = customerKey(s);
    if (!key) continue;                    // a walk-in belongs to nobody
    const row = entry(key);
    row.sales += 1;
    row.spent += num(s?.total);
    // A sale left Pending or Partial is money this customer owes too, not
    // only a repair -- this used to only count repairs, so a customer who
    // walked off with an unpaid sale looked fully settled everywhere this
    // total is read.
    row.owed += saleOwed(s);
    seen(row, s?.createdAt);
  }

  for (const r of repairs) {
    const key = customerKey(r);
    if (!key) continue;
    const row = entry(key);
    row.repairs += 1;
    row.spent += repairTotal(r);
    row.owed += repairOwed(r);
    seen(row, r?.createdAt);
  }

  return map;
}

export function customersSummary(customers = [], totals = new Map(), now = new Date()) {
  let newToday = 0;
  let owed = 0;
  let owing = 0;

  for (const c of customers) {
    if (isToday(c?.createdAt, now)) newToday += 1;
    const row = totals.get(customerKey(c));
    if (row?.owed > 0) {
      owed += row.owed;
      owing += 1;
    }
  }

  return { total: customers.length, newToday, owed, owing };
}

/**
 * Every sale and repair still owed money, in one figure -- what the
 * 3-hourly pending-payment reminder reads to decide whether it has anything
 * worth interrupting the shop for. `oldestAt` is the earliest of them, so a
 * reminder built from this can carry a stable timestamp instead of "now",
 * which would put it back at the top of a feed on every render.
 */
export function pendingPaymentsSummary(sales = [], repairs = []) {
  let count = 0;
  let total = 0;
  let oldestAt = null;

  function fold(records, owedFn) {
    for (const record of records) {
      const owed = owedFn(record);
      if (owed <= 0) continue;
      count += 1;
      total += owed;
      const at = record?.createdAt;
      if (at && (!oldestAt || new Date(at) < new Date(oldestAt))) oldestAt = at;
    }
  }

  fold(sales, saleOwed);
  fold(repairs, repairOwed);

  return { count, total, oldestAt };
}
