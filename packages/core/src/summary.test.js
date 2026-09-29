import { describe, it, expect } from "vitest";
import {
  isToday, repairTotal, repairOwed, saleOwed, isOpenRepair,
  repairsSummary, salesSummary, customerKey, customerTotals, customersSummary,
  pendingPaymentsSummary, groupByPeriod,
} from "./summary";

const NOW = new Date("2026-09-21T14:00:00+01:00");
const today = (h = 9) => new Date(`2026-09-21T${String(h).padStart(2, "0")}:00:00+01:00`).toISOString();
const yesterday = new Date("2026-09-20T09:00:00+01:00").toISOString();

describe("today means the shop's today", () => {
  it("counts this morning", () => {
    expect(isToday(today(), NOW)).toBe(true);
  });

  it("does not count yesterday", () => {
    expect(isToday(yesterday, NOW)).toBe(false);
  });

  it("uses the shop's midnight, not UTC", () => {
    // This one has to be run in the shop's own timezone to mean anything.
    // 00:30 in Lagos is 23:30 the previous day in UTC, so a UTC day boundary
    // would file the start of a shop's day under yesterday -- and the runner
    // here sits in UTC, where the bug is invisible.
    const was = process.env.TZ;
    try {
      process.env.TZ = "Africa/Lagos";
      const lagosNow = new Date("2026-09-21T14:00:00+01:00");
      const justAfterMidnight = new Date("2026-09-21T00:30:00+01:00").toISOString();
      const justBeforeIt = new Date("2026-09-20T23:30:00+01:00").toISOString();
      expect(isToday(justAfterMidnight, lagosNow)).toBe(true);
      expect(isToday(justBeforeIt, lagosNow)).toBe(false);
    } finally {
      process.env.TZ = was;
    }
  });

  it("says no to junk rather than guessing", () => {
    expect(isToday(null, NOW)).toBe(false);
    expect(isToday("not a date", NOW)).toBe(false);
  });
});

describe("grouping sales and repairs by period", () => {
  // A Thursday, so there is room in the fixture for "earlier this week"
  // to actually be a different day from "today" -- the NOW above is a
  // Monday, where those two are the same day and the split can't be tested.
  const GROUP_NOW = new Date("2026-09-24T14:00:00+01:00");
  const at = (iso) => new Date(iso).toISOString();

  it("splits into Today / This Week / This Month / Older, newest bucket first", () => {
    const records = [
      { id: "a", createdAt: at("2026-09-24T09:00:00+01:00") }, // today (Thu)
      { id: "b", createdAt: at("2026-09-22T09:00:00+01:00") }, // this week (Tue)
      { id: "c", createdAt: at("2026-09-05T09:00:00+01:00") }, // this month
      { id: "d", createdAt: at("2026-08-15T09:00:00+01:00") }, // older
    ];

    const groups = groupByPeriod(records, GROUP_NOW);

    expect(groups.map((g) => g.key)).toEqual(["today", "week", "month", "older"]);
    expect(groups.map((g) => g.label)).toEqual(["Today", "This Week", "This Month", "Older"]);
    expect(groups.map((g) => g.items.map((r) => r.id))).toEqual([["a"], ["b"], ["c"], ["d"]]);
  });

  it("leaves out a bucket that has nothing in it, rather than an empty heading", () => {
    const records = [{ id: "a", createdAt: at("2026-09-24T09:00:00+01:00") }];
    const groups = groupByPeriod(records, GROUP_NOW);
    expect(groups.map((g) => g.key)).toEqual(["today"]);
  });

  it("keeps records within a bucket in the order they were given", () => {
    // db.getSales()/getRepairs() already return newest-first; this only
    // partitions that order into buckets, it never re-sorts.
    const records = [
      { id: "second", createdAt: at("2026-09-24T15:00:00+01:00") },
      { id: "first", createdAt: at("2026-09-24T09:00:00+01:00") },
    ];
    const groups = groupByPeriod(records, GROUP_NOW);
    expect(groups[0].items.map((r) => r.id)).toEqual(["second", "first"]);
  });

  it("files a record with no usable date as Older rather than dropping it", () => {
    const records = [{ id: "broken", createdAt: null }];
    const groups = groupByPeriod(records, GROUP_NOW);
    expect(groups.map((g) => g.key)).toEqual(["older"]);
  });

  it("returns nothing at all for an empty list", () => {
    expect(groupByPeriod([], GROUP_NOW)).toEqual([]);
  });
});

describe("what a repair costs", () => {
  it("is labour plus the parts that went into it", () => {
    // repairCost is LABOUR -- the modal says so. Reading it as the bill
    // under-reports every job that used a part, which is most of them.
    const r = { repairCost: 5000, parts: [{ price: 8000, qty: 1 }, { price: 1500, qty: 2 }] };
    expect(repairTotal(r)).toBe(16000);
  });

  it("is just the labour when nothing was fitted", () => {
    expect(repairTotal({ repairCost: 3000 })).toBe(3000);
  });

  it("survives a record with nothing useful in it", () => {
    expect(repairTotal({})).toBe(0);
    expect(repairTotal({ repairCost: "abc", parts: [{ price: null, qty: "x" }] })).toBe(0);
  });
});

describe("what the shop is still owed", () => {
  it("is nothing on a paid job", () => {
    expect(repairOwed({ repairCost: 5000, paymentStatus: "Paid" })).toBe(0);
  });

  it("is the whole bill on an unpaid one", () => {
    expect(repairOwed({ repairCost: 5000, paymentStatus: "Unpaid" })).toBe(5000);
  });

  it("counts a partial payment as still owing", () => {
    // The app records THAT something was paid, never how much. Treating it as
    // settled would under-state the money out there; a shop chasing payments
    // would rather find one already settled than be short.
    expect(repairOwed({ repairCost: 5000, paymentStatus: "Partial" })).toBe(5000);
  });
});

describe("the repairs header", () => {
  const repairs = [
    { status: "received", createdAt: today(), repairCost: 4000, paymentStatus: "Unpaid" },
    { status: "in progress", createdAt: yesterday, repairCost: 6000, paymentStatus: "Paid" },
    { status: "completed", createdAt: yesterday, repairCost: 3000, paymentStatus: "Unpaid" },
    { status: "delivered", createdAt: yesterday, repairCost: 9000, paymentStatus: "Paid" },
  ];

  it("counts what is still on the bench", () => {
    // Completed and delivered are finished; everything else is open work.
    expect(repairsSummary(repairs, NOW).open).toBe(2);
  });

  it("counts what came in today", () => {
    expect(repairsSummary(repairs, NOW).inToday).toBe(1);
  });

  it("counts what is done and still on the shelf", () => {
    // Finished work nobody has come for. Delivered has gone home; completed
    // has not, and that is the pile a shop wants to know about.
    expect(repairsSummary(repairs, NOW).ready).toBe(1);
  });

  it("adds up what has not been paid for", () => {
    expect(repairsSummary(repairs, NOW).owed).toBe(7000);
  });

  it("says zero for a shop with no repairs rather than throwing", () => {
    expect(repairsSummary([], NOW)).toMatchObject({ total: 0, open: 0, owed: 0 });
  });
});

describe("the sales header", () => {
  const sales = [
    { total: 12000, createdAt: today() },
    { total: 8000, createdAt: today(10) },
    { total: 50000, createdAt: yesterday },
  ];

  it("leads with today, because that is what a shop opens the app to see", () => {
    const s = salesSummary(sales, NOW);
    expect(s.today).toBe(2);
    expect(s.todayTotal).toBe(20000);
  });

  it("keeps the running total as well", () => {
    expect(salesSummary(sales, NOW).allTotal).toBe(70000);
  });
});

describe("matching work to a customer", () => {
  it("matches on the phone number, which is what the shop types", () => {
    expect(customerKey({ phone: "08012345678" })).toBe("p:08012345678");
    expect(customerKey({ customerPhone: "08012345678" })).toBe("p:08012345678");
  });

  it("falls back to the name, tidied", () => {
    expect(customerKey({ customerName: " Ade " })).toBe("n:ade");
    expect(customerKey({ name: "ADE" })).toBe("n:ade");
  });

  it("matches a walk-in to nobody", () => {
    expect(customerKey({})).toBe("");
  });
});

describe("what each customer has spent", () => {
  // Paid in full: this group is about SPENDING, not what is still owed --
  // see "what each customer owes" below for a sale left unpaid.
  const sales = [
    { customerPhone: "0801", total: 12000, createdAt: today(), paymentStatus: "Paid" },
    { customerPhone: "0801", total: 8000, createdAt: yesterday, paymentStatus: "Paid" },
    { total: 5000, createdAt: today(), paymentStatus: "Paid" }, // walk-in
  ];
  const repairs = [
    { customerPhone: "0801", repairCost: 4000, parts: [{ price: 1000, qty: 2 }],
      paymentStatus: "Unpaid", createdAt: today() },
  ];

  it("adds their sales and their repairs together", () => {
    const row = customerTotals(sales, repairs).get("p:0801");
    expect(row).toMatchObject({ sales: 2, repairs: 1, spent: 26000, owed: 6000 });
  });

  it("does not file a walk-in under somebody", () => {
    const totals = customerTotals(sales, repairs);
    expect(totals.size).toBe(1);
  });

  it("remembers when they were last in", () => {
    expect(customerTotals(sales, repairs).get("p:0801").lastAt).toBe(today());
  });

  it("counts who owes, and how much, across the shop", () => {
    const totals = customerTotals(sales, repairs);
    const s = customersSummary(
      [{ phone: "0801", createdAt: today() }, { phone: "0802", createdAt: yesterday }],
      totals,
      NOW,
    );
    expect(s).toMatchObject({ total: 2, newToday: 1, owed: 6000, owing: 1 });
  });
});

describe("what a sale is still owed", () => {
  it("is nothing on a paid sale", () => {
    expect(saleOwed({ total: 20000, amountPaid: 20000, paymentStatus: "Paid" })).toBe(0);
  });

  it("is the whole total on one recorded as pending, with nothing paid in", () => {
    expect(saleOwed({ total: 20000, paymentStatus: "Pending" })).toBe(20000);
  });

  it("is what is left, not the whole total, on a partial payment", () => {
    // amountPaid records how much actually came in -- reading "not Paid" as
    // "none of it paid" would tell a shop it is owed 20,000 on a sale it has
    // already collected 15,000 of.
    expect(saleOwed({ total: 20000, amountPaid: 15000, paymentStatus: "Partial" })).toBe(5000);
  });

  it("never goes negative, however it was recorded", () => {
    expect(saleOwed({ total: 20000, amountPaid: 25000, paymentStatus: "Partial" })).toBe(0);
  });
});

describe("the sales header also totals what is owed", () => {
  it("adds unpaid and partial sales, and leaves paid ones out", () => {
    const sales = [
      { total: 20000, paymentStatus: "Paid", createdAt: today() },
      { total: 15000, paymentStatus: "Pending", createdAt: today() },
      { total: 10000, amountPaid: 4000, paymentStatus: "Partial", createdAt: yesterday },
    ];
    expect(salesSummary(sales, NOW).owed).toBe(21000);
  });
});

describe("a sale left unpaid counts toward what a customer owes", () => {
  it("adds to the same customer total a repair already does", () => {
    // customerTotals used to only read repairs for this -- a customer who
    // walked off with an unpaid sale looked fully settled everywhere this
    // total is read.
    const sales = [{ customerPhone: "0801", total: 9000, paymentStatus: "Pending", createdAt: today() }];
    const repairs = [{ customerPhone: "0801", repairCost: 4000, paymentStatus: "Unpaid", createdAt: today() }];
    expect(customerTotals(sales, repairs).get("p:0801").owed).toBe(13000);
  });
});

describe("everything still owed, sales and repairs together", () => {
  it("adds up both, and names the oldest one", () => {
    const sales = [
      { total: 9000, paymentStatus: "Pending", createdAt: today(9) },
      { total: 5000, paymentStatus: "Paid", createdAt: today(10) }, // settled, not counted
    ];
    const repairs = [
      { repairCost: 4000, paymentStatus: "Unpaid", createdAt: yesterday },
    ];
    const s = pendingPaymentsSummary(sales, repairs);
    expect(s.count).toBe(2);
    expect(s.total).toBe(13000);
    expect(s.oldestAt).toBe(yesterday);
  });

  it("says nothing is owed for a shop with nothing outstanding, rather than throwing", () => {
    expect(pendingPaymentsSummary([], [])).toMatchObject({ count: 0, total: 0, oldestAt: null });
  });
});
