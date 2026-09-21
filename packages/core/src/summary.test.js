import { describe, it, expect } from "vitest";
import {
  isToday, repairTotal, repairOwed, isOpenRepair,
  repairsSummary, salesSummary, customerKey, customerTotals, customersSummary,
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
  const sales = [
    { customerPhone: "0801", total: 12000, createdAt: today() },
    { customerPhone: "0801", total: 8000, createdAt: yesterday },
    { total: 5000, createdAt: today() },                        // walk-in
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
