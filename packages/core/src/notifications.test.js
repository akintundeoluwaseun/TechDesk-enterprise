import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { notificationFeed } from "./notifications";

beforeEach(() => storage.clear());

describe("the bell folds in a pending-payments reminder", () => {
  it("adds nothing when every sale and repair is settled", () => {
    db.createSale({ items: [], total: 5000, amountPaid: 5000, paymentStatus: "Paid" });
    expect(notificationFeed().some((item) => item.type === "owed")).toBe(false);
  });

  it("adds one line naming how many are owed, and how much, when something isn't", () => {
    db.createSale({ items: [], total: 5000, paymentStatus: "Pending" });
    db.createRepair({ device: "iPhone 11", repairCost: 4000, paymentStatus: "Unpaid" });

    const item = notificationFeed().find((i) => i.type === "owed");
    expect(item).toBeTruthy();
    expect(item.message).toMatch(/2 payments/);
    expect(item.message).toMatch(/9,000|9000/);
  });

  it("says one payment, not two, when only one is owed", () => {
    db.createSale({ items: [], total: 5000, paymentStatus: "Pending" });
    const item = notificationFeed().find((i) => i.type === "owed");
    expect(item.message).toMatch(/1 payment /);
  });

  it("stays out of the way once cleared, the same as everything else in the feed", () => {
    db.createSale({ items: [], total: 5000, paymentStatus: "Pending" });
    // A moment safely after the sale was recorded -- clearing does not
    // require the sale to be paid to go quiet; the item's timestamp (the
    // oldest still-owed record's own createdAt) is treated exactly like any
    // other item's for this, the same rule low stock already follows.
    const clearedAt = new Date(Date.now() + 60_000).toISOString();
    expect(notificationFeed(clearedAt).some((i) => i.type === "owed")).toBe(false);
  });
});
