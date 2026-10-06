import { db } from "./db";

/**
 * Goods going back to a supplier.
 *
 * This is not a customer return and must not be squeezed into one. A customer
 * return has an invoice, a person, and money handed back; stock comes IN. A
 * supplier return has none of those: a box arrived short, damaged or simply
 * wrong, and it goes back OUT for a credit. Forcing the second through the
 * first is exactly why recording them felt like a headache -- there was no
 * invoice to find, and inventing a customer to refund made the books wrong.
 *
 * One note covers a whole delivery, because that is how they happen: twenty
 * lines going back to one supplier on one day, not twenty separate events.
 */

export const RETURN_REASONS = ["Damaged", "Wrong item", "Short-dated", "Not selling", "Over-supplied", "Other"];

/** What the shop is owed back, at what each line cost them. */
export function creditTotal(lines = []) {
  return lines.reduce((n, l) => n + (Number(l.unitCost) || 0) * (Number(l.qty) || 0), 0);
}

/**
 * Turns picked lines into a note, taking the stock off the shelf.
 * Lines are `{ productId, qty, unitCost?, reason? }`; anything with no
 * quantity is dropped, and nothing may send back more than is on the shelf.
 */
export function sendBackToSupplier({ supplier, reference = "", note = "", lines = [], actor } = {}) {
  const priced = [];
  for (const line of lines) {
    const product = db.findInventoryItem(line.productId);
    const want = Math.round(Number(line.qty) || 0);
    if (!product || want <= 0) continue;
    const qty = Math.min(want, Number(product.stock || 0));
    if (qty <= 0) continue;
    priced.push({
      productId: product.id,
      name: product.name,
      qty,
      unitCost: line.unitCost != null ? Number(line.unitCost) : Number(product.costPrice || 0),
      reason: line.reason || "",
    });
  }
  if (!priced.length) return null;

  const before = priced.map((l) => ({ id: l.productId, stock: Number(db.findInventoryItem(l.productId)?.stock || 0) }));
  priced.forEach((l) => {
    const p = db.findInventoryItem(l.productId);
    if (p) db.updateInventoryItem(l.productId, { stock: Math.max(0, Number(p.stock || 0) - l.qty) });
  });

  const credit = creditTotal(priced);
  const record = db.addSupplierReturn({
    supplier: supplier || "Supplier",
    reference,
    note,
    lines: priced,
    credit,
    settled: false,
    actor,
  });

  db.logActivity({
    type: "inventory",
    message: `Sent back to ${record.supplier}: ${priced.length} item${priced.length === 1 ? "" : "s"}, ${priced.reduce((n, l) => n + l.qty, 0)} in all`,
    refId: record.id,
    actor,
  });

  return {
    record,
    credit,
    undo() {
      before.forEach((b) => {
        const p = db.findInventoryItem(b.id);
        if (p) db.updateInventoryItem(b.id, { stock: b.stock });
      });
      db.deleteSupplierReturn(record.id);
      db.logActivity({ type: "inventory", message: `Return to ${record.supplier} undone`, refId: record.id, actor });
    },
  };
}

/** Marks a note as credited (or paid) by the supplier. */
export function settleSupplierReturn(id, settled = true) {
  return db.updateSupplierReturn(id, { settled, settledAt: settled ? new Date().toISOString() : null });
}

/** What is still owed back, by supplier -- the number worth chasing. */
export function outstandingCredit(returns = db.getSupplierReturns()) {
  const bySupplier = new Map();
  let total = 0;
  for (const r of returns) {
    if (r.settled) continue;
    total += Number(r.credit) || 0;
    const key = r.supplier || "Supplier";
    bySupplier.set(key, (bySupplier.get(key) || 0) + (Number(r.credit) || 0));
  }
  return {
    total,
    suppliers: [...bySupplier.entries()].map(([supplier, amount]) => ({ supplier, amount })).sort((a, b) => b.amount - a.amount),
  };
}
