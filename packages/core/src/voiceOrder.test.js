import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "./db";
import { storage } from "./storage";
import { saveAppControl } from "./appControl";
import { matchProduct, matchCustomer, matchRepair, resolve, issues, apply, runUndo, saleTotal, send, isOnline, voiceOrder } from "./voiceOrder";

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

describe("a photo of the old notebook", () => {
  beforeEach(() => storage.clear());
  const now = new Date(2026, 9, 4, 15, 0, 0);

  it("puts each sale on the day written on the page, without taking from today's stock", () => {
    const s = seed();
    const drafts = resolve([
      { type: "sale", customerName: "Chidi", items: [{ product: "charger", qty: 2 }], paymentMethod: "Cash", date: "2026-03-15" },
      { type: "sale", customerName: "Aisha Bello", items: [{ product: "iPhone 11 battery", qty: 5, price: 17000 }], paidInFull: false, amountPaid: 50000, date: "2026-03-16" },
    ], {}, { source: "photo", now });
    expect(drafts[0].takeFromStock).toBe(false);
    // 5 batteries but only 3 on the shelf: fine for an old sale.
    expect(issues(drafts[1])).toEqual([]);
    const out = apply(drafts, { actor: "Admin" });
    expect(out.saved).toBe(2);
    const sales = db.getSales();
    const march15 = sales.find((x) => x.total === 15000);
    expect(new Date(march15.createdAt).getDate()).toBe(15);
    expect(new Date(march15.createdAt).getMonth()).toBe(2);
    expect(sales.find((x) => x.total === 85000).amountPaid).toBe(50000);
    expect(db.findInventoryItem(s.charger.id).stock).toBe(25);
    expect(db.findInventoryItem(s.bat11.id).stock).toBe(3);
    expect(db.getActivity()[0].message).toMatch(/from a notebook photo/);
    runUndo(out.undo);
    expect(db.getSales()).toHaveLength(0);
    expect(db.findInventoryItem(s.charger.id).stock).toBe(25);
  });

  it("takes from stock when the person ticks it", () => {
    const s = seed();
    const [d] = resolve([{ type: "sale", items: [{ product: "charger", qty: 2 }], date: "2026-03-15" }], {}, { source: "photo", now });
    apply([{ ...d, takeFromStock: true }]);
    expect(db.findInventoryItem(s.charger.id).stock).toBe(23);
  });

  it("sets the count for a stock count, adds for goods that came in, and undoes either", () => {
    const s = seed();
    const drafts = resolve([
      { type: "stock", product: "charger", qty: 9, stockCount: true },
      { type: "stock", product: "type-c cable", qty: 10, stockCount: false },
    ], {}, { source: "photo", now });
    expect(drafts.map((d) => d.mode)).toEqual(["set", "add"]);
    const out = apply(drafts);
    expect(db.findInventoryItem(s.charger.id).stock).toBe(9);
    expect(db.findInventoryItem(s.cable.id).stock).toBe(50);
    runUndo(out.undo);
    expect(db.findInventoryItem(s.charger.id).stock).toBe(25);
    expect(db.findInventoryItem(s.cable.id).stock).toBe(40);
  });

  it("keeps an old repair's status and date; dates in the future or today mean now", () => {
    seed();
    const drafts = resolve([
      { type: "repair", customerName: "Bayo", device: "Tecno Spark 10", problem: "Screen", cost: 25000, status: "delivered", date: "2026-02-01" },
      { type: "sale", items: [{ product: "charger", qty: 1 }], date: "2099-12-25" },
    ], {}, { source: "photo", now: new Date() }); // the real today: a sale dated today is saved "now"
    expect(drafts[0].status).toBe("delivered");
    expect(drafts[1].date).toBe(voiceOrder.localDay());
    apply(drafts);
    const rep = db.getRepairs().find((r) => r.device === "Tecno Spark 10");
    expect(rep.status).toBe("delivered");
    expect(new Date(rep.createdAt).getMonth()).toBe(1);
    const sale = db.getSales()[0];
    expect(Date.now() - new Date(sale.createdAt).getTime()).toBeLessThan(60000);
  });

  it("never treats a page as a question", () => {
    const [d] = resolve([{ type: "question", intent: "who_owes" }], {}, { source: "photo", now });
    expect(d.type).toBe("unknown");
    expect(d.include).toBe(false);
  });

  it("sends the photo, not audio", async () => {
    let body;
    const fetchImpl = async (_u, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ ok: true, transcript: "", actions: [] }) }; };
    await send({ image: "AAAA", text: "March sales" }, { fetchImpl });
    expect(body.image).toBe("AAAA");
    expect(body.imageMime).toBe("image/jpeg");
    expect(body.audio).toBeUndefined();
    expect(body.text).toBe("March sales");
  });
});

describe("returns: 'the laptop John bought yesterday was returned'", () => {
  beforeEach(() => storage.clear());
  const now = new Date(2026, 9, 5, 12, 0, 0);
  const at = (d, h = 11) => { const x = new Date(now); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };

  function shop() {
    const laptop = db.addInventoryItem({ name: "HP EliteBook 840", price: 350000, costPrice: 280000, stock: 3 });
    const mouse = db.addInventoryItem({ name: "Wireless mouse", price: 5000, costPrice: 2500, stock: 20 });
    const j1 = db.findOrCreateCustomer({ name: "John Okoro", phone: "08030000001" });
    const j2 = db.findOrCreateCustomer({ name: "John Bello", phone: "08030000002" });
    const item = (p, qty) => ({ id: db.uid("item"), productId: p.id, name: p.name, price: p.price, costPrice: p.costPrice, qty, fromInventory: true });
    const s1 = db.createSale({ customerId: j1.id, customerName: "John Okoro", items: [item(laptop, 1), item(mouse, 1)], subtotal: 355000, total: 355000, amountPaid: 355000, paymentStatus: "Paid", createdAt: at(1) });
    const s2 = db.createSale({ customerId: j2.id, customerName: "John Bello", items: [item(laptop, 1)], subtotal: 350000, total: 350000, amountPaid: 350000, paymentStatus: "Paid", createdAt: at(1, 15) });
    return { laptop, mouse, j1, j2, s1, s2 };
  }

  it("asks which John when two bought a laptop yesterday", () => {
    shop();
    const [d] = resolve([{ type: "return", customerName: "John", product: "HP EliteBook", period: "yesterday" }], {}, { now });
    expect(d.matches.map((m) => m.customerName).sort()).toEqual(["John Bello", "John Okoro"]);
    expect(d.pick).toBe(null);
    expect(issues(d)).toEqual(["Which John?"]);
  });

  it("finds the one sale when the name is clear, then takes the laptop off it, restocks it, and refunds it", () => {
    const s = shop();
    const stockBefore = db.findInventoryItem(s.laptop.id).stock;
    const [d] = resolve([{ type: "return", customerName: "John Okoro", product: "HP EliteBook", period: "yesterday" }], {}, { now });
    expect(d.pick.invoice).toBe(s.s1.invoice);
    expect(issues(d)).toEqual([]);
    const out = apply([d], { actor: "Admin" });
    const sale = db.getSales().find((x) => x.id === s.s1.id);
    expect(sale.items.map((i) => i.name)).toEqual(["Wireless mouse"]);
    expect(sale.total).toBe(5000);
    expect(sale.amountPaid).toBe(5000); // 350,000 given back
    expect(sale.returns[0]).toMatchObject({ name: "HP EliteBook 840", qty: 1, refund: 350000 });
    expect(db.findInventoryItem(s.laptop.id).stock).toBe(stockBefore + 1);
    runUndo(out.undo);
    expect(db.getSales().find((x) => x.id === s.s1.id).total).toBe(355000);
    expect(db.findInventoryItem(s.laptop.id).stock).toBe(stockBefore);
  });

  it("'the laptop' when stock calls it 'HP EliteBook': offers what that John bought, and asks", () => {
    shop();
    const [d] = resolve([{ type: "return", customerName: "John Okoro", product: "laptop", period: "yesterday" }], {}, { now });
    expect(d.matches.map((m) => m.name)).toEqual(["HP EliteBook 840", "Wireless mouse"]);
    expect(issues(d)).toEqual(["Which one was returned?"]);
  });

  it("says so when there's no such sale", () => {
    shop();
    const [d] = resolve([{ type: "return", customerName: "Musa", product: "printer" }], {}, { now });
    expect(issues(d)[0]).toMatch(/No sale of printer to Musa was found/);
  });

  it("writes a one-line history, no details", async () => {
    const s = shop();
    const [d] = resolve([{ type: "return", customerName: "John Okoro", product: "HP EliteBook 840" }], {}, { now });
    apply([d]);
    const { assistantHistory } = await import("./assistantHistory");
    expect(assistantHistory()[0].text).toBe("Return recorded · John Okoro");
    expect(s).toBeTruthy();
  });
});

describe("correcting and cancelling a sale", () => {
  beforeEach(() => storage.clear());
  const now = new Date(2026, 9, 5, 12, 0, 0);
  const at = (d, h = 11) => { const x = new Date(now); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };

  function shop() {
    const charger = db.addInventoryItem({ name: "20W charger", price: 8000, costPrice: 4000, stock: 10 });
    const cable = db.addInventoryItem({ name: "Type-C cable", price: 2500, costPrice: 1200, stock: 20 });
    const bayo = db.findOrCreateCustomer({ name: "Bayo Adams", phone: "08051112222" });
    const item = (p, qty) => ({ id: db.uid("item"), productId: p.id, name: p.name, price: p.price, costPrice: p.costPrice, qty, fromInventory: true });
    const s1 = db.createSale({ customerId: bayo.id, customerName: "Bayo Adams", items: [item(charger, 2), item(cable, 1)], subtotal: 18500, total: 18500, amountPaid: 18500, paymentStatus: "Paid", paymentMethod: "Cash", createdAt: at(1) });
    const s2 = db.createSale({ customerName: "Walk-in", items: [item(cable, 2)], subtotal: 5000, total: 5000, amountPaid: 5000, paymentStatus: "Paid", paymentMethod: "Cash", createdAt: at(0, 9) });
    return { charger, cable, bayo, s1, s2 };
  }

  it("'the charger I sold Bayo was 7k not 8k, and he paid by POS': fixes the price, the total and the method", () => {
    const s = shop();
    const [d] = resolve([{ type: "edit_sale", customerName: "Bayo", product: "charger", newPrice: 7000, paymentMethod: "POS" }], {}, { now });
    expect(d.pick.invoice).toBe(s.s1.invoice);
    expect(d.itemIdx).toBe(0);
    expect(issues(d)).toEqual([]);
    const out = apply([d]);
    const sale = db.getSales().find((x) => x.id === s.s1.id);
    expect(sale.items[0].price).toBe(7000);
    expect(sale.total).toBe(16500);
    expect(sale.amountPaid).toBe(16500); // was fully paid: stays fully paid
    expect(sale.paymentMethod).toBe("POS");
    runUndo(out.undo);
    const back = db.getSales().find((x) => x.id === s.s1.id);
    expect([back.items[0].price, back.total, back.paymentMethod]).toEqual([8000, 18500, "Cash"]);
  });

  it("changing a quantity moves stock the right way, and undo moves it back", () => {
    const s = shop();
    const before = db.findInventoryItem(s.charger.id).stock;
    const [d] = resolve([{ type: "edit_sale", customerName: "Bayo Adams", product: "charger", newQty: 3 }], {}, { now });
    const out = apply([d]);
    expect(db.findInventoryItem(s.charger.id).stock).toBe(before - 1);
    runUndo(out.undo);
    expect(db.findInventoryItem(s.charger.id).stock).toBe(before);
  });

  it("asks which item when the sale has several and none was named", () => {
    shop();
    const [d] = resolve([{ type: "edit_sale", customerName: "Bayo", newQty: 1 }], {}, { now });
    expect(issues(d)).toEqual(["Which item on the sale?"]);
  });

  it("'cancel the last sale': removes it, restocks, and undo brings the same sale back", () => {
    const s = shop();
    const before = db.findInventoryItem(s.cable.id).stock;
    const [d] = resolve([{ type: "cancel_sale" }], {}, { now });
    expect(d.pick.invoice).toBe(s.s2.invoice);
    const out = apply([d]);
    expect(db.getSales().find((x) => x.id === s.s2.id)).toBeUndefined();
    expect(db.findInventoryItem(s.cable.id).stock).toBe(before + 2);
    runUndo(out.undo);
    const back = db.getSales().find((x) => x.id === s.s2.id);
    expect(back.invoice).toBe(s.s2.invoice);
    expect(db.findInventoryItem(s.cable.id).stock).toBe(before);
    expect(JSON.parse(storage.getItem("techdesk_tombstones") || "[]").some((t) => t.id === s.s2.id)).toBe(false);
  });

  it("finds a sale by its invoice number", () => {
    const s = shop();
    const [d] = resolve([{ type: "cancel_sale", invoice: s.s1.invoice.toLowerCase() }], {}, { now });
    expect(d.pick.saleId).toBe(s.s1.id);
  });
});
