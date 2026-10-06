import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { storage } from "./storage";
import { recordReturn } from "./voiceOrder";

// A return has to move three things together -- the sale, the shelf and the
// log -- and be undoable. The Assistant has always done this; the button on
// the Sales page now goes through the same function, so neither can drift.
describe("recording a return", () => {
  beforeEach(() => storage.clear());

  function shopWithASale() {
    const product = db.addInventoryItem({
      name: "Screen guard", sku: "", category: "Other",
      price: 2500, costPrice: 1500, stock: 10, lowStockThreshold: 2, description: "",
    });
    const sale = db.createSale({
      items: [{ id: db.uid("item"), productId: product.id, name: "Screen guard", price: 2500, costPrice: 1500, qty: 4, imei: "", fromInventory: true }],
      customerId: null, customerName: "Bola", customerPhone: "", customerEmail: "", customerAddress: "",
      subtotal: 10000, discount: 0, total: 10000, amountPaid: 10000, paymentMethod: "Cash", paymentStatus: "Paid",
    });
    return { product, sale };
  }

  it("takes the line off the sale, puts the stock back and hands the money over", () => {
    const { product, sale } = shopWithASale();
    const before = db.findInventoryItem(product.id).stock;

    const done = recordReturn(sale.id, 0, { qty: 2 });
    expect(done.back).toBe(2);
    expect(done.refund).toBe(5000);

    const after = db.getSales().find((s) => s.id === sale.id);
    expect(after.items[0].qty).toBe(2);
    expect(after.total).toBe(5000);
    expect(after.amountPaid).toBe(5000);
    expect(after.returns).toHaveLength(1);
    expect(db.findInventoryItem(product.id).stock).toBe(before + 2);
  });

  it("puts everything back exactly when it is undone", () => {
    const { product, sale } = shopWithASale();
    const stock = db.findInventoryItem(product.id).stock;
    const done = recordReturn(sale.id, 0, { qty: 3 });
    done.undo();

    const after = db.getSales().find((s) => s.id === sale.id);
    expect(after.items[0].qty).toBe(4);
    expect(after.total).toBe(10000);
    expect(after.amountPaid).toBe(10000);
    expect(after.returns).toEqual([]);
    expect(db.findInventoryItem(product.id).stock).toBe(stock);
  });

  it("hands back only what was actually paid, so an unpaid sale just shrinks", () => {
    const { sale } = shopWithASale();
    db.updateSale(sale.id, { amountPaid: 0, paymentStatus: "Pending" });
    const done = recordReturn(sale.id, 0, { qty: 1 });
    expect(done.refund).toBe(0);
    const after = db.getSales().find((s) => s.id === sale.id);
    expect(after.total).toBe(7500);
    expect(after.amountPaid).toBe(0);
  });

  it("leaves a one-off item's stock alone, since it never came off the shelf", () => {
    const sale = db.createSale({
      items: [{ id: db.uid("item"), productId: null, name: "Swapped phone", price: 50000, costPrice: 0, qty: 1, imei: "", fromInventory: false }],
      customerName: "Walk-in", subtotal: 50000, discount: 0, total: 50000, amountPaid: 50000,
      paymentMethod: "Cash", paymentStatus: "Paid",
    });
    const counts = db.getInventory().map((p) => p.stock).join();
    recordReturn(sale.id, 0, { qty: 1 });
    expect(db.getInventory().map((p) => p.stock).join()).toBe(counts);
  });

  it("says nothing happened when the sale or the line is gone", () => {
    expect(recordReturn("nope", 0, { qty: 1 })).toBe(null);
  });
});
