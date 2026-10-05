import { describe, it, expect } from "vitest";
import { parseQuestion, range, answer, brief, fromAi } from "./insights";

const money = (n) => `₦${Math.round(Number(n) || 0).toLocaleString("en-NG")}`;
const branches = [{ id: "ik", name: "Ikeja" }, { id: "yb", name: "Yaba Main" }];
const ins = {
  ok: true, today: "2026-10-07", branches,
  days: [
    { branch: "ik", day: "2026-10-07", sales: 2, repairs: 1, revenue: 48000, profit: 35000 },
    { branch: "yb", day: "2026-10-07", sales: 1, repairs: 0, revenue: 5000, profit: 3000 },
    { branch: "ik", day: "2026-10-06", sales: 1, repairs: 0, revenue: 30000, profit: 14000 },
    { branch: "yb", day: "2026-10-06", sales: 3, repairs: 0, revenue: 45000, profit: 20000 },
    { branch: "ik", day: "2026-10-05", sales: 1, repairs: 0, revenue: 25000, profit: 9000 },
    { branch: "ik", day: "2026-09-30", sales: 1, repairs: 0, revenue: 10000, profit: 4000 },
  ],
  owed: [
    { kind: "sale", branch: "ik", amount: 20000, customer: "Tunde", since: "2026-10-06", number: "INV-00012" },
    { kind: "repair", branch: "yb", amount: 5000, customer: "Chidi", since: "2026-10-01" },
  ],
  repairs: [{ branch: "ik", open: 2, ready: 1, today: 1 }, { branch: "yb", open: 0, ready: 2, today: 0 }],
  lowStock: [{ branch: "ik", name: "iPhone 11 battery", stock: 0, mark: 3 }],
  top: [{ name: "Charger", qty: 6, revenue: 45000 }],
};

describe("understanding head office", () => {
  it("reads the question, the period and the branch", () => {
    expect(parseQuestion("How much did we sell today?", branches)).toMatchObject({ intent: "sales", period: "today", branch: null });
    expect(parseQuestion("profit at ikeja this week", branches)).toMatchObject({ intent: "profit", period: "week", branch: { id: "ik" } });
    expect(parseQuestion("Which branch sold most yesterday", branches)).toMatchObject({ intent: "branches", period: "yesterday" });
    expect(parseQuestion("who owes us money", branches).intent).toBe("owed");
    expect(parseQuestion("wetin dem owe for Yaba", branches)).toMatchObject({ intent: "owed", branch: { id: "yb" } });
    expect(parseQuestion("what's running low?", branches).intent).toBe("stock");
    expect(parseQuestion("repairs ready for pickup", branches).intent).toBe("repairs");
    expect(parseQuestion("best selling products", branches).intent).toBe("top");
    expect(parseQuestion("abeg how market dey go", branches).intent).toBe("brief");
    expect(parseQuestion("how far Ikeja", branches)).toMatchObject({ intent: "brief", branch: { id: "ik" } });
    expect(parseQuestion("tell me a joke", branches).intent).toBeNull();
  });
  it("takes the AI's reading when the words are unusual", () => {
    expect(fromAi({ intent: "who_owes", subject: "Yaba" }, branches)).toMatchObject({ intent: "owed", branch: { id: "yb" } });
    expect(fromAi({ intent: "sales_total", period: "this week" }, branches)).toMatchObject({ intent: "sales", period: "week" });
  });
});

describe("periods, Lagos days", () => {
  it("weeks start on Monday, months on the 1st", () => {
    expect(range("week", "2026-10-07")).toEqual(["2026-10-05", "2026-10-07"]); // Wed 7 Oct
    expect(range("last_week", "2026-10-07")).toEqual(["2026-09-28", "2026-10-04"]);
    expect(range("month", "2026-10-07")).toEqual(["2026-10-01", "2026-10-07"]);
    expect(range("last_month", "2026-10-07")).toEqual(["2026-09-01", "2026-09-30"]);
  });
});

describe("answers from the figures", () => {
  it("sales today across branches, with the comparison", () => {
    const a = answer({ intent: "sales", period: "today" }, ins, money);
    expect(a.figure).toBe("₦53,000");
    expect(a.sub).toMatch(/3 sales and 1 repair/);
    expect(a.sub).toMatch(/down 29% on/);
    expect(a.rows.map((r) => r.label)).toEqual(["Ikeja", "Yaba Main"]);
  });
  it("one branch's profit this week", () => {
    const a = answer({ intent: "profit", period: "week", branch: branches[0] }, ins, money);
    expect(a.figure).toBe("₦58,000");
    expect(a.title).toBe("Profit at Ikeja this week");
  });
  it("which branch, ranked", () => {
    const a = answer({ intent: "branches", period: "yesterday" }, ins, money);
    expect(a.figure).toBe("Yaba Main");
    expect(a.rows[0]).toMatchObject({ label: "Yaba Main", value: "₦45,000" });
  });
  it("who owes, biggest first, with where", () => {
    const a = answer({ intent: "owed" }, ins, money);
    expect(a.figure).toBe("₦25,000");
    expect(a.rows[0]).toMatchObject({ label: "Tunde", value: "₦20,000" });
    expect(a.rows[0].note).toMatch(/Ikeja · sale INV-00012/);
  });
  it("repairs, stock and best sellers", () => {
    expect(answer({ intent: "repairs" }, ins, money)).toMatchObject({ figure: "2 open", sub: "3 jobs ready, waiting to be collected" });
    expect(answer({ intent: "stock" }, ins, money).rows[0]).toMatchObject({ label: "iPhone 11 battery", value: "0 left" });
    expect(answer({ intent: "top" }, ins, money).figure).toBe("Charger");
  });
  it("says what it can do when it didn't understand", () => {
    expect(answer({ intent: null }, ins, money).title).toBe("I can answer these");
  });
});

describe("the daily summary", () => {
  it("yesterday, today, the week, the best branch and what needs a look", () => {
    const b = brief(ins, money, { offline: 1 });
    const row = (l) => b.rows.find((r) => r.label === l);
    expect(b.figure).toBe("₦75,000");
    expect(row("Yesterday").note).toMatch(/up 200% on the day before/);
    expect(row("Today so far").value).toBe("₦53,000");
    expect(row("This week").value).toBe("₦153,000");
    expect(row("Best branch yesterday").value).toBe("Yaba Main");
    expect(row("Owed to you").value).toBe("₦25,000");
    expect(row("Repairs ready").value).toBe("3");
    expect(row("Running low").note).toBe("iPhone 11 battery");
    expect(row("Devices to check").value).toBe("1");
  });
});
