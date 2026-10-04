import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "./storage";
import { buildBrief, briefText, briefDue, markBriefSeen, setBriefOff } from "./morningBrief";

// Wednesday 7 October 2026, 8am.
const NOW = new Date(2026, 9, 7, 8, 0, 0);
const at = (daysAgo, hour = 11) => { const d = new Date(NOW); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 0, 0, 0); return d.toISOString(); };

function shop() {
  const inventory = [
    { id: "p1", name: "20W charger", price: 7500, costPrice: 4000, stock: 20, lowStockThreshold: 5 },
    { id: "p2", name: "iPhone 11 battery", price: 18000, costPrice: 11000, stock: 0, lowStockThreshold: 3 },
    { id: "p3", name: "Phone pouch", price: 1500, costPrice: 700, stock: 2, lowStockThreshold: 5 },
  ];
  const sales = [
    // yesterday (Tuesday)
    { id: "s1", createdAt: at(1), customerId: "c1", customerName: "Chidi Okafor", customerPhone: "08031234567", total: 15000, amountPaid: 15000, paymentStatus: "Paid", items: [{ productId: "p1", qty: 2, price: 7500, costPrice: 4000 }] },
    { id: "s2", createdAt: at(1), customerName: "Walk-in", total: 18000, amountPaid: 18000, paymentStatus: "Paid", items: [{ productId: "p2", qty: 1, price: 18000, costPrice: 11000 }] },
    // a week before yesterday
    { id: "s3", createdAt: at(8), customerName: "Walk-in", total: 22000, amountPaid: 22000, paymentStatus: "Paid", items: [] },
    // owed for 12 days
    { id: "s4", createdAt: at(12), customerId: "c2", customerName: "Bayo Adams", customerPhone: "08051112222", total: 9000, amountPaid: 4000, paymentStatus: "Pending", items: [{ productId: "p2", qty: 0.5, price: 18000, costPrice: 11000 }] },
  ];
  const repairs = [
    { id: "r1", ticket: "REP-0318", createdAt: at(6), readyAt: at(3), customerName: "Aisha Bello", customerPhone: "08127654321", device: "Samsung A54", status: "completed", repairCost: 20000, paymentStatus: "Unpaid", parts: [] },
    { id: "r2", ticket: "REP-0320", createdAt: at(10), customerName: "Tunde", device: "HP laptop", status: "awaiting parts", repairCost: 30000, paymentStatus: "Unpaid", parts: [] },
  ];
  return { sales, repairs, inventory };
}

describe("the morning brief", () => {
  beforeEach(() => storage.clear());

  it("sums the last trading day like Reports does, and compares it with the same day last week", () => {
    const b = buildBrief(shop(), NOW);
    expect(b.greeting).toBe("Good morning");
    expect(b.last.label).toBe("Yesterday");
    expect(b.last.total).toBe(33000);
    expect(b.last.sales).toBe(2);
    expect(b.last.profit).toBe(33000 - 8000 - 11000);
    expect(b.last.change).toBe(Math.round(((33000 - 22000) / 22000) * 100));
  });

  it("skips an empty day: on a quiet Monday, the last day is Saturday", () => {
    const data = shop();
    data.sales = [{ id: "x", createdAt: at(3), total: 5000, amountPaid: 5000, paymentStatus: "Paid", items: [] }];
    const b = buildBrief(data, NOW);
    expect(b.last.total).toBe(5000);
    expect(b.last.label).toBe(new Date(at(3)).toLocaleDateString(undefined, { weekday: "long" }));
  });

  it("lists who owes, biggest first, counting only finished repairs", () => {
    const b = buildBrief(shop(), NOW);
    expect(b.owed.top.map((e) => [e.name, e.amount])).toEqual([["Aisha Bello", 20000], ["Bayo Adams", 5000]]);
    expect(b.owed.total).toBe(25000);
    expect(b.owed.top[1].days).toBe(12);
  });

  it("puts money first in today's to-do: collections, then balances, then restocking and slow jobs", () => {
    const b = buildBrief(shop(), NOW);
    // Aisha owes for the repair she's being reminded to collect: asked once, not twice.
    expect(b.todo.map((x) => x.kind)).toEqual(["collect", "owed", "restock", "slow"]);
    expect(b.todo[1].name).toBe("Bayo Adams");
    expect(b.todo[0].text).toBe("Remind Aisha to collect the Samsung A54");
    expect(b.todo[0].detail).toMatch(/Ready 3 days · not paid yet · REP-0318/);
    expect(b.todo[2].text).toBe("Restock iPhone 11 battery");
    expect(b.todo[3].detail).toMatch(/10 days on the bench · awaiting parts/);
    expect(b.low.map((p) => p.name)).toEqual(["iPhone 11 battery", "Phone pouch"]);
  });

  it("writes a text version for WhatsApp, with or without profit", () => {
    const b = buildBrief(shop(), NOW);
    const withProfit = briefText(b, { shop: "Ade Gadgets", money: (n) => `₦${n}` });
    expect(withProfit).toMatch(/Ade Gadgets: morning brief/);
    expect(withProfit).toMatch(/Yesterday: ₦33000 from 2 sales, profit ₦14000/);
    expect(withProfit).toMatch(/Owed to you: ₦25000 by 2 customers/);
    expect(briefText(b, { showProfit: false })).not.toMatch(/profit/);
  });

  it("shows itself once a day, in the morning, when there is something to say", () => {
    const b = buildBrief(shop(), NOW);
    expect(briefDue(NOW, b)).toBe(true);
    expect(briefDue(new Date(2026, 9, 7, 15, 0), b)).toBe(false);
    markBriefSeen(NOW);
    expect(briefDue(new Date(2026, 9, 7, 11, 0), b)).toBe(false);
    expect(briefDue(new Date(2026, 9, 8, 7, 0), b)).toBe(true);
    setBriefOff(true);
    expect(briefDue(new Date(2026, 9, 8, 7, 0), b)).toBe(false);
    setBriefOff(false);
    expect(briefDue(new Date(2026, 9, 8, 7, 0), buildBrief({ sales: [], repairs: [], inventory: [] }, NOW))).toBe(false);
  });
});
