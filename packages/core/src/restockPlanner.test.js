import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { storage } from "./storage";
import { buildRestockPlan, fitToBudget, orderTotal, orderText, receiveOrder, runRestockUndo, saveRestockSettings, restockSettings } from "./restockPlanner";

const NOW = new Date(2026, 9, 5, 12, 0, 0);
const ago = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();
const sale = (productId, qty, d) => ({ id: `s${Math.random()}`, createdAt: ago(d), items: [{ productId, qty }] });

const inventory = [
  { id: "charger", name: "20W charger", stock: 4, costPrice: 4000, price: 7500, lowStockThreshold: 5 },
  { id: "battery", name: "iPhone 11 battery", stock: 0, costPrice: 11000, price: 18000, lowStockThreshold: 3 },
  { id: "cable", name: "Type-C cable", stock: 40, costPrice: 1200, price: 2500, lowStockThreshold: 5 },
  { id: "pouch", name: "Phone pouch", stock: 2, costPrice: 700, price: 1500, lowStockThreshold: 5 },
  { id: "tripod", name: "Ring light tripod", stock: 6, costPrice: 9000, price: 15000, lowStockThreshold: 1, createdAt: ago(200) },
];
// chargers: 1 a day for the last 14 days; batteries: 6 fitted on repairs; cables: 10 sold; tripod: last sold 90 days ago
const sales = [
  ...Array.from({ length: 14 }, (_, i) => sale("charger", 1, i + 0.5)),
  sale("cable", 10, 3),
  sale("tripod", 1, 90),
];
const repairs = [{ id: "r1", createdAt: ago(5), parts: [{ productId: "battery", qty: 6 }] }];

describe("the restock planner", () => {
  beforeEach(() => storage.clear());

  it("works out how fast each thing goes and what to buy", () => {
    const plan = buildRestockPlan({ inventory, sales, repairs }, NOW, { leadDays: 3, coverDays: 14 });
    const by = Object.fromEntries(plan.lines.map((l) => [l.id, l]));
    // chargers: 14 in the recent half, counted double: 28/44 a day
    expect(by.charger.status).toBe("soon");
    expect(by.charger.perWeek).toBe(4.5);
    expect(by.charger.daysLeft).toBe(6);
    expect(by.charger.suggest).toBe(Math.ceil((28 / 44) * 17) - 4);
    // batteries go into repairs, and there are none left
    expect(by.battery.status).toBe("out");
    expect(by.battery.suggest).toBe(Math.ceil((12 / 44) * 17));
    // plenty of cables: not on the list
    expect(by.cable).toBeUndefined();
    // pouches: under the mark but not selling: top up to the mark only
    expect(by.pouch).toMatchObject({ status: "low", suggest: 3 });
    expect(plan.lines.map((l) => l.id)).toEqual(["battery", "charger", "pouch"]);
  });

  it("lists money sitting on the shelf", () => {
    const plan = buildRestockPlan({ inventory, sales, repairs }, NOW, {});
    expect(plan.idle.map((x) => [x.name, x.value, x.days, x.neverSold])).toEqual([
      ["Ring light tripod", 54000, 90, false],
      ["Phone pouch", 1400, null, true], // never sold, no date it was added
    ]);
    expect(plan.idleValue).toBe(55400);
  });

  it("fits a budget, most urgent first", () => {
    const plan = buildRestockPlan({ inventory, sales, repairs }, NOW, {});
    const qty = fitToBudget(plan.lines, {}, 50000);
    expect(qty.battery).toBe(4); // 4 x 11,000 = 44,000 of the 5 wanted
    expect(qty.charger).toBe(1); // 6,000 left: one charger
    expect(qty.pouch).toBe(2); // 2,000 left: two pouches
    expect(orderTotal(plan.lines, qty)).toBeLessThanOrEqual(50000);
  });

  it("writes the order for the supplier, without prices", () => {
    const plan = buildRestockPlan({ inventory, sales, repairs }, NOW, {});
    const text = orderText(plan.lines, { pouch: 0 }, { shop: "Ade Gadgets" });
    expect(text).toMatch(/this is Ade Gadgets/);
    expect(text).toMatch(/• iPhone 11 battery × 5/);
    expect(text).not.toMatch(/pouch/i);
    expect(text).not.toMatch(/₦|\d{4,}/);
  });

  it("adds the goods to stock when they arrive, and undoes it", () => {
    const item = db.addInventoryItem({ name: "20W charger", stock: 4, costPrice: 4000, price: 7500 });
    const lines = [{ id: item.id, name: item.name, suggest: 7, cost: 4000 }];
    const out = receiveOrder(lines, { [item.id]: 7 }, { costs: { [item.id]: 4200 } });
    expect(out.added).toBe(1);
    expect(db.findInventoryItem(item.id)).toMatchObject({ stock: 11, costPrice: 4200 });
    runRestockUndo(out.undo);
    expect(db.findInventoryItem(item.id)).toMatchObject({ stock: 4, costPrice: 4000 });
  });

  it("remembers the lead time, cover and budget", () => {
    saveRestockSettings({ leadDays: "5", coverDays: 30, budget: "100000" });
    expect(restockSettings()).toEqual({ leadDays: 5, coverDays: 30, budget: 100000 });
  });
});
