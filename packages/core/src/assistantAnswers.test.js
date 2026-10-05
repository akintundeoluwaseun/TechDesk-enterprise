import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { storage } from "./storage";
import { answerQuestion, periodRange } from "./assistantAnswers";
import { resolve } from "./voiceOrder";

const now = new Date("2026-10-07T15:00:00"); // a Wednesday
const ago = (days) => new Date(now.getTime() - days * 86400000).toISOString();
const value = (a, label) => a.lines.find((l) => l.label === label)?.value;

function seed() {
  db.saveInventory([
    { id: "p1", name: "20W USB-C fast charger", price: 7500, costPrice: 4200, stock: 25, lowStockThreshold: 5 },
    { id: "p2", name: "iPhone 11 battery", price: 18000, costPrice: 11000, stock: 2, lowStockThreshold: 3 },
  ]);
  db.saveCustomers([{ id: "c1", name: "Chidi Okafor", phone: "08031234567" }]);
  storage.setItem("techdesk_sales", JSON.stringify([
    { id: "s1", createdAt: ago(0), customerId: "c1", customerName: "Chidi Okafor", total: 15000, amountPaid: 5000, paymentStatus: "Pending", actor: "Tunde",
      items: [{ productId: "p1", name: "20W USB-C fast charger", price: 7500, costPrice: 4200, qty: 2 }] },
    { id: "s2", createdAt: ago(1), customerName: "Walk-in", total: 18000, amountPaid: 18000, paymentStatus: "Paid", actor: "Admin",
      items: [{ productId: "p2", name: "iPhone 11 battery", price: 18000, costPrice: 11000, qty: 1 }] },
    { id: "s3", createdAt: ago(40), customerName: "Old", total: 99999, amountPaid: 99999, paymentStatus: "Paid", items: [] },
  ]));
  db.saveRepairs([
    { id: "r1", ticket: "REP-0318", createdAt: ago(3), readyAt: ago(2), customerId: "c1", customerName: "Chidi Okafor", device: "iPhone 13", status: "completed", repairCost: 20000, paymentStatus: "Unpaid", parts: [] },
    { id: "r2", ticket: "REP-0319", createdAt: ago(0), customerName: "Aisha Bello", device: "A54", status: "in progress", repairCost: 15000, paymentStatus: "Unpaid", parts: [] },
  ]);
}

describe("answering questions from the shop's own records", () => {
  beforeEach(() => { storage.clear(); seed(); });

  it("works out periods in the shop's own week and month", () => {
    const [a, b] = periodRange("this_week", now);
    expect(a.getDay()).toBe(1); // Monday
    expect(b > now).toBe(true);
    const [y1, y2] = periodRange("yesterday", now);
    expect(y2 - y1).toBe(86400000);
  });

  it("sales today, and this week", () => {
    expect(value(answerQuestion({ intent: "sales_total", period: "today" }, {}, now), "Sold")).toBe(15000);
    const week = answerQuestion({ intent: "sales_total", period: "this_week" }, {}, now);
    expect(value(week, "Sold")).toBe(33000);
    expect(value(week, "Still owed")).toBe(10000);
  });

  it("profit counts cost of goods and finished repairs, like the Reports page", () => {
    const a = answerQuestion({ intent: "profit", period: "this_month" }, {}, now);
    expect(value(a, "Profit")).toBe(33000 + 20000 - (8400 + 11000));
  });

  it("who owes, and one customer's balance", () => {
    const a = answerQuestion({ intent: "who_owes" }, {}, now);
    // Aisha's repair is still on the bench: not owed yet.
    expect(value(a, "Total owed")).toBe(10000 + 20000);
    expect(value(a, "Chidi Okafor")).toBe(30000);
    expect(value(answerQuestion({ intent: "customer_balance", subject: "Chidi" }, {}, now), "Owes")).toBe(30000);
  });

  it("low stock, stock of one thing, and repairs waiting to be collected", () => {
    expect(answerQuestion({ intent: "low_stock" }, {}, now).lines[0]).toMatchObject({ label: "iPhone 11 battery", value: "2 left" });
    expect(answerQuestion({ intent: "stock_of", subject: "charger" }, {}, now).lines[0].value).toBe("25 left");
    expect(answerQuestion({ intent: "repairs_ready" }, {}, now).lines[0].value).toBe("2d waiting");
  });

  it("sales by worker", () => {
    const a = answerQuestion({ intent: "worker_sales", period: "this_week", subject: "Tunde" }, {}, now);
    expect(a.lines).toEqual([{ label: "Tunde (1)", value: 15000, money: true }]);
  });

  it("a question arrives as an answer card, never something to save", () => {
    const [d] = resolve([{ type: "question", intent: "who_owes", note: "who dey owe me" }]);
    expect(d.include).toBe(false);
    expect(d.answer.title).toBe("Who owes you");
  });
});
