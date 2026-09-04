import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";

describe("invoice/ticket numbering", () => {
  beforeEach(() => localStorage.clear());

  it("never reuses a number after the record that used it is deleted", () => {
    const first = db.createSale({ items: [], total: 0 });
    const second = db.createSale({ items: [], total: 0 });
    expect(second.invoice).not.toBe(first.invoice);

    db.deleteSale(second.id);

    const third = db.createSale({ items: [], total: 0 });
    expect(third.invoice).not.toBe(second.invoice);
    expect(third.invoice).not.toBe(first.invoice);
  });

  it("seeds the counter from existing records so it can't collide after an upgrade", () => {
    localStorage.setItem(
      db.KEYS.sales,
      JSON.stringify([{ id: "s1", invoice: "INV-00042", items: [], total: 0 }])
    );
    const next = db.createSale({ items: [], total: 0 });
    expect(next.invoice).toBe("INV-00043");
  });
});

describe("restoreBackup", () => {
  beforeEach(() => localStorage.clear());

  it("restores only recognized keys", () => {
    const backup = JSON.stringify({
      data: {
        [db.KEYS.customers]: JSON.stringify([{ id: "c1", name: "Jane" }]),
        not_a_real_key: JSON.stringify([{ id: "x" }]),
      },
    });
    db.restoreBackup(backup);
    expect(db.getCustomers()).toEqual([{ id: "c1", name: "Jane" }]);
    expect(localStorage.getItem("not_a_real_key")).toBeNull();
  });

  it("rejects a malformed backup without touching existing data", () => {
    localStorage.setItem(db.KEYS.customers, JSON.stringify([{ id: "c1", name: "Jane" }]));
    const malformed = JSON.stringify({
      data: {
        [db.KEYS.customers]: "{not valid json",
      },
    });
    expect(() => db.restoreBackup(malformed)).toThrow();
    expect(db.getCustomers()).toEqual([{ id: "c1", name: "Jane" }]);
  });

  it("rejects a backup with no recognized data", () => {
    expect(() => db.restoreBackup(JSON.stringify({ data: { junk: "1" } }))).toThrow();
  });
});
