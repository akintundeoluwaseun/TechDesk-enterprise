import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { storage } from "./storage";
import { sendBackToSupplier, settleSupplierReturn, outstandingCredit, creditTotal } from "./supplierReturns";

const product = (name, stock, cost) =>
  db.addInventoryItem({ name, sku: "", category: "Other", price: cost * 2, costPrice: cost, stock, lowStockThreshold: 2, description: "" });

// Sending a box back to a supplier is not a customer return: no invoice, no
// customer, nobody refunded. Stock goes OUT and the shop is owed a credit.
describe("sending goods back to a supplier", () => {
  beforeEach(() => storage.clear());

  it("takes the whole delivery off the shelf in one note", () => {
    const a = product("Screen guard", 50, 400);
    const b = product("USB-C cable", 30, 700);

    const out = sendBackToSupplier({
      supplier: "Alaba Electronics",
      reference: "INV-8821",
      lines: [{ productId: a.id, qty: 12, reason: "Damaged" }, { productId: b.id, qty: 5, reason: "Wrong item" }],
    });

    expect(db.findInventoryItem(a.id).stock).toBe(38);
    expect(db.findInventoryItem(b.id).stock).toBe(25);
    expect(out.credit).toBe(12 * 400 + 5 * 700);
    expect(out.record.supplier).toBe("Alaba Electronics");
    expect(out.record.lines).toHaveLength(2);
    expect(db.getSupplierReturns()).toHaveLength(1);
  });

  it("never sends back more than is on the shelf", () => {
    const a = product("Screen guard", 3, 400);
    const out = sendBackToSupplier({ supplier: "Alaba", lines: [{ productId: a.id, qty: 99 }] });
    expect(out.record.lines[0].qty).toBe(3);
    expect(db.findInventoryItem(a.id).stock).toBe(0);
  });

  it("skips empty lines, and records nothing at all when none are left", () => {
    const a = product("Screen guard", 10, 400);
    const out = sendBackToSupplier({ supplier: "Alaba", lines: [{ productId: a.id, qty: 2 }, { productId: a.id, qty: 0 }, { productId: "gone", qty: 5 }] });
    expect(out.record.lines).toHaveLength(1);
    expect(sendBackToSupplier({ supplier: "Alaba", lines: [{ productId: "gone", qty: 1 }] })).toBe(null);
    expect(db.getSupplierReturns()).toHaveLength(1);
  });

  it("puts the stock back and drops the note when undone", () => {
    const a = product("Screen guard", 50, 400);
    const out = sendBackToSupplier({ supplier: "Alaba", lines: [{ productId: a.id, qty: 12 }] });
    out.undo();
    expect(db.findInventoryItem(a.id).stock).toBe(50);
    expect(db.getSupplierReturns()).toHaveLength(0);
  });

  it("uses the cost price unless the shop says otherwise", () => {
    const a = product("Screen guard", 50, 400);
    const out = sendBackToSupplier({ supplier: "Alaba", lines: [{ productId: a.id, qty: 2, unitCost: 350 }] });
    expect(out.credit).toBe(700);
  });

  it("adds up what is still owed, by supplier, and forgets it once settled", () => {
    const a = product("Screen guard", 50, 400);
    const b = product("Cable", 50, 700);
    const one = sendBackToSupplier({ supplier: "Alaba", lines: [{ productId: a.id, qty: 10 }] });
    sendBackToSupplier({ supplier: "Computer Village", lines: [{ productId: b.id, qty: 10 }] });

    let owed = outstandingCredit();
    expect(owed.total).toBe(4000 + 7000);
    expect(owed.suppliers[0]).toEqual({ supplier: "Computer Village", amount: 7000 });

    settleSupplierReturn(one.record.id);
    owed = outstandingCredit();
    expect(owed.total).toBe(7000);
    expect(owed.suppliers).toHaveLength(1);
  });

  it("adds a line up the way a shop would", () => {
    expect(creditTotal([{ qty: 3, unitCost: 500 }, { qty: 2, unitCost: 250 }])).toBe(2000);
    expect(creditTotal()).toBe(0);
  });
});
