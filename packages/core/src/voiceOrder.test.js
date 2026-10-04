import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "./db";
import { storage } from "./storage";
import { saveAppControl } from "./appControl";
import { matchProduct, matchCustomer, matchRepair, resolve, issues, apply, runUndo, saleTotal, send, isOnline } from "./voiceOrder";

function seed() {
  const charger = db.addInventoryItem({ name: "20W USB-C fast charger", price: 7500, costPrice: 4200, stock: 25 });
  const cable = db.addInventoryItem({ name: "Type-C cable (1m, braided)", price: 2500, costPrice: 1200, stock: 40 });
  const bat11 = db.addInventoryItem({ name: "iPhone 11 battery", price: 18000, costPrice: 11000, stock: 3 });
  const bat13 = db.addInventoryItem({ name: "iPhone 13 battery", price: 24000, costPrice: 16000, stock: 2 });
  const chidi = db.findOrCreateCustomer({ name: "Chidi Okafor", phone: "08031234567" });
  const aisha1 = db.findOrCreateCustomer({ name: "Aisha Bello", phone: "08127654321" });
  const aisha2 = db.findOrCreateCustomer({ name: "Aisha Musa", phone: "09011112222" });
  const rep = db.createRepair({ customerId: chidi.id, customerName: "Chidi Okafor", device: "iPhone 13 Pro Max", problem: "Screen", repairCost: 95000 });
  return { charger, cable, bat11, bat13, chidi, aisha1, aisha2, rep };
}

describe("matching what was said to the shop's own records", () => {
  beforeEach(() => storage.clear());

  it("finds a product from a loose name, plural or not", () => {
    const s = seed();
    const inv = db.getInventory();
    expect(matchProduct("chargers", inv).product.id).toBe(s.charger.id);
    expect(matchProduct("type-c cable", inv).product.id).toBe(s.cable.id);
    expect(matchProduct("20W USB-C fast charger", inv).product.id).toBe(s.charger.id);
  });

  it("asks instead of guessing when two products fit", () => {
    seed();
    const m = matchProduct("iphone battery", db.getInventory());
    expect(m.product).toBe(null);
    expect(m.candidates.map((p) => p.name).sort()).toEqual(["iPhone 11 battery", "iPhone 13 battery"]);
  });

  it("finds nothing for a product the shop doesn't have", () => {
    seed();
    expect(matchProduct("PS5 controller", db.getInventory()).product).toBe(null);
  });

  it("matches a customer by phone first, then by name, and asks when two share a first name", () => {
    const s = seed();
    const cs = db.getCustomers();
    expect(matchCustomer("Aisha", "0812 765 4321", cs).customer.id).toBe(s.aisha1.id);
    expect(matchCustomer("Chidi", null, cs).customer.id).toBe(s.chidi.id);
    const m = matchCustomer("Aisha", null, cs);
    expect(m.customer).toBe(null);
    expect(m.candidates).toHaveLength(2);
  });

  it("finds a repair by ticket, or by the customer's open job", () => {
    const s = seed();
    const reps = db.getRepairs();
    expect(matchRepair({ ticket: s.rep.ticket.replace("REP-", "") }, reps).repair.id).toBe(s.rep.id);
    expect(matchRepair({ customerName: "Chidi" }, reps, s.chidi).repair.id).toBe(s.rep.id);
  });
});

describe("drafts: what the shop checks before saving", () => {
  beforeEach(() => storage.clear());

  it("prices a sale from the shop's own prices, not from what was heard", () => {
    seed();
    const [d] = resolve([{ type: "sale", customerName: "Chidi", paymentMethod: "Bank Transfer", items: [{ product: "charger", qty: 2 }, { product: "cable", qty: 1 }] }]);
    expect(issues(d)).toEqual([]);
    expect(saleTotal(d)).toBe(17500);
    expect(d.paymentMethod).toBe("Bank Transfer");
  });

  it("flags the unclear parts, in words a shop understands", () => {
    seed();
    const [sale, stock, status, q] = resolve([
      { type: "sale", customerName: "Aisha", items: [{ product: "iphone battery", qty: 1 }, { product: "PS5 controller", qty: 1 }] },
      { type: "stock", product: "Infinix Hot 40 screen", qty: 5 },
      { type: "repair_status", ticket: "REP-9999", status: "completed" },
      { type: "question", note: "how much did I sell today" },
    ]);
    expect(issues(sale)).toEqual([
      'Which product is "iphone battery"?',
      'Price for iphone battery?',
      'Price for PS5 controller?',
      "Which Aisha?",
    ]);
    expect(sale.items[1].oneOff).toBe(true);
    expect(issues(stock)).toEqual(["Selling price for Infinix Hot 40 screen?"]);
    expect(issues(status)).toEqual(["Couldn't find that repair."]);
    expect(q.include).toBe(false);
    expect(q.answer.title).toMatch(/can't answer/);
  });

  it("won't sell more than the shelf holds", () => {
    seed();
    const [d] = resolve([{ type: "sale", items: [{ product: "iPhone 11 battery", qty: 5 }] }]);
    expect(issues(d)).toEqual(["Only 3 iPhone 11 battery in stock."]);
  });
});

describe("saving, and undoing", () => {
  beforeEach(() => storage.clear());

  it("saves a sale, a repair, stock and a status change, then undoes all of it exactly", () => {
    const s = seed();
    const salesBefore = db.getSales().length;
    const drafts = resolve([
      { type: "sale", customerName: "Chidi", paymentMethod: "Bank Transfer", items: [{ product: "charger", qty: 2 }] },
      { type: "repair", customerName: "Grace Eze", customerPhone: "09012340987", device: "Tecno Camon 20", problem: "Battery drains", cost: 12000 },
      { type: "stock", product: "iPhone 11 battery", qty: 10, costPrice: 10500 },
      { type: "stock", product: "Infinix Hot 40 screen", qty: 4, price: 30000, costPrice: 21000 },
      { type: "repair_status", ticket: s.rep.ticket, status: "completed" },
    ]);
    drafts.forEach((d) => expect(issues(d)).toEqual([]));
    const { saved, undo } = apply(drafts, { actor: "Tunde" });
    expect(saved).toBe(5);

    const sale = db.getSales()[0];
    expect(sale.total).toBe(15000);
    expect(sale.items[0].costPrice).toBe(4200);
    expect(sale.paymentStatus).toBe("Paid");
    expect(db.findInventoryItem(s.charger.id).stock).toBe(23);
    expect(db.findInventoryItem(s.bat11.id)).toMatchObject({ stock: 13, costPrice: 10500, price: 18000 });
    expect(db.getInventory().find((p) => p.name === "Infinix Hot 40 screen")).toMatchObject({ stock: 4, price: 30000 });
    expect(db.getRepairs().find((r) => r.id === s.rep.id).status).toBe("completed");
    expect(db.getCustomers().find((c) => c.name === "Grace Eze").phone).toBe("09012340987");
    expect(db.getActivity().filter((a) => a.message.endsWith("(by voice)"))).toHaveLength(5);

    runUndo(undo);
    expect(db.getSales()).toHaveLength(salesBefore);
    expect(db.findInventoryItem(s.charger.id).stock).toBe(25);
    expect(db.findInventoryItem(s.bat11.id)).toMatchObject({ stock: 3, costPrice: 11000 });
    expect(db.getInventory().find((p) => p.name === "Infinix Hot 40 screen")).toBeUndefined();
    expect(db.getRepairs().find((r) => r.id === s.rep.id).status).toBe("received");
    expect(db.getRepairs().find((r) => r.device === "Tecno Camon 20")).toBeUndefined();
  });

  it("records a part-payment on a sale, and skips anything unticked or unclear", () => {
    const s = seed();
    db.createSale({ items: [], customerId: s.chidi.id, customerName: "Chidi Okafor", total: 50000, amountPaid: 20000, paymentStatus: "Pending" });
    const drafts = resolve([
      { type: "payment", customerName: "Chidi", amountPaid: 10000 },
      { type: "sale", items: [{ product: "charger", qty: 1 }] },
      { type: "sale", items: [{ product: "iphone battery", qty: 1 }] },
    ]);
    // Chidi owes on a sale and on a repair: it asks which, rather than guessing.
    expect(issues(drafts[0])).toEqual(["Which one is being paid?"]);
    drafts[0].target = drafts[0].candidates.find((c) => c.kind === "sale");
    drafts[1].include = false;
    expect(apply(drafts).saved).toBe(1);
    const sale = db.getSales().find((x) => x.total === 50000);
    expect(sale).toMatchObject({ amountPaid: 30000, paymentStatus: "Pending" });
    expect(db.getSales()).toHaveLength(1);
  });
});

describe("talking to the server", () => {
  beforeEach(() => storage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("sends only product names, never prices, customers or sales", async () => {
    seed();
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, transcript: "hi", actions: [] }) }));
    const r = await send({ text: "sell a charger" }, { fetchImpl });
    expect(r.ok).toBe(true);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.products).toContain("20W USB-C fast charger");
    expect(Object.keys(body).sort()).toEqual(["installId", "products", "text", "today"]);
    expect(JSON.stringify(body)).not.toMatch(/7500|Chidi|0803/);
  });

  it("says paused when the console switched voice off, without calling the server", async () => {
    saveAppControl({ features: { ai: false } });
    const fetchImpl = vi.fn();
    expect((await send({ text: "x" }, { fetchImpl })).paused).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("passes the server's own message through (limits, errors)", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({ ok: false, error: "limit", message: "You've used today's voice orders on this device." }) }));
    expect(await send({ text: "x" }, { fetchImpl })).toMatchObject({ ok: false, error: "limit", message: "You've used today's voice orders on this device." });
  });

  it("is offline when nothing answers", async () => {
    expect(await isOnline({ fetchImpl: async () => { throw new Error("no route"); } })).toBe(false);
    expect(await isOnline({ fetchImpl: async () => ({ ok: true }) })).toBe(true);
  });
});

describe("things the shop sells that aren't in its stock", () => {
  beforeEach(() => storage.clear());

  it("sells them as a one-off item once a price is given, without touching stock", () => {
    seed();
    const [d] = resolve([{ type: "sale", customerName: "Chidi", items: [{ product: "Phone pouch", qty: 2 }] }]);
    expect(issues(d)).toEqual(["Price for Phone pouch?"]);
    d.items[0].price = 1500;
    expect(issues(d)).toEqual([]);
    const stockBefore = db.getInventory().map((p) => p.stock).join();
    apply([d]);
    const sale = db.getSales()[0];
    expect(sale.total).toBe(3000);
    expect(sale.items[0]).toMatchObject({ name: "Phone pouch", productId: null, fromInventory: false });
    expect(db.getInventory().map((p) => p.stock).join()).toBe(stockBefore);
  });
});
