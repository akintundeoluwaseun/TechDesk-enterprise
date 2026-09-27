import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { storage } from "./storage";

describe("invoice/ticket numbering", () => {
  beforeEach(() => storage.clear());

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
    storage.setItem(
      db.KEYS.sales,
      JSON.stringify([{ id: "s1", invoice: "INV-00042", items: [], total: 0 }])
    );
    const next = db.createSale({ items: [], total: 0 });
    expect(next.invoice).toBe("INV-00043");
  });
});

describe("restoreBackup", () => {
  beforeEach(() => storage.clear());

  it("restores only recognized keys", () => {
    const backup = JSON.stringify({
      data: {
        [db.KEYS.customers]: JSON.stringify([{ id: "c1", name: "Jane" }]),
        not_a_real_key: JSON.stringify([{ id: "x" }]),
      },
    });
    db.restoreBackup(backup);
    expect(db.getCustomers()).toEqual([{ id: "c1", name: "Jane" }]);
    expect(storage.getItem("not_a_real_key")).toBeNull();
  });

  it("rejects a malformed backup without touching existing data", () => {
    storage.setItem(db.KEYS.customers, JSON.stringify([{ id: "c1", name: "Jane" }]));
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

describe("mergeBackup", () => {
  beforeEach(() => storage.clear());

  function backupOf(overrides) {
    return JSON.stringify({
      data: Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, JSON.stringify(v)])),
    });
  }

  it("keeps existing records and adds the incoming ones", () => {
    storage.setItem(db.KEYS.customers, JSON.stringify([{ id: "c1", name: "Jane" }]));
    const result = db.mergeBackup(backupOf({ [db.KEYS.customers]: [{ id: "c2", name: "Musa" }] }));

    expect(db.getCustomers().map((c) => c.id).sort()).toEqual(["c1", "c2"]);
    expect(result.added.customers).toBe(1);
  });

  it("is a no-op when the same backup is merged twice", () => {
    const backup = backupOf({ [db.KEYS.customers]: [{ id: "c2", name: "Musa" }] });
    db.mergeBackup(backup);
    const second = db.mergeBackup(backup);

    expect(db.getCustomers()).toHaveLength(1);
    expect(second.added.customers).toBe(0);
  });

  it("reissues an incoming invoice number that is already in use here", () => {
    storage.setItem(
      db.KEYS.sales,
      JSON.stringify([{ id: "local", invoice: "INV-00001", items: [], total: 10 }])
    );
    db.mergeBackup(
      backupOf({ [db.KEYS.sales]: [{ id: "incoming", invoice: "INV-00001", items: [], total: 99 }] })
    );

    const sales = db.getSales();
    expect(sales).toHaveLength(2);
    const invoices = sales.map((s) => s.invoice);
    expect(new Set(invoices).size).toBe(2);
    // the local record keeps its number; the incoming one is renumbered
    expect(sales.find((s) => s.id === "local").invoice).toBe("INV-00001");
    expect(sales.find((s) => s.id === "incoming").invoice).not.toBe("INV-00001");
  });

  it("moves the counter past every merged number so the next sale can't collide", () => {
    db.mergeBackup(
      backupOf({ [db.KEYS.sales]: [{ id: "s9", invoice: "INV-00009", items: [], total: 0 }] })
    );
    const next = db.createSale({ items: [], total: 0 });
    expect(next.invoice).toBe("INV-00010");
  });

  it("copies shop settings only when none were set on this device", () => {
    const incoming = { [db.KEYS.settings]: { shopName: "Musa Repairs" } };

    db.mergeBackup(backupOf({ ...incoming, [db.KEYS.customers]: [{ id: "c1" }] }));
    expect(db.getSettings().shopName).toBe("Musa Repairs");

    storage.clear();
    db.saveSettings({ ...db.getSettings(), shopName: "Already Mine" });
    db.mergeBackup(backupOf({ ...incoming, [db.KEYS.customers]: [{ id: "c2" }] }));
    expect(db.getSettings().shopName).toBe("Already Mine");
  });

  it("rejects a backup with nothing to merge", () => {
    expect(() => db.mergeBackup(JSON.stringify({ data: {} }))).toThrow();
  });
});

describe("applyIncoming", () => {
  beforeEach(() => storage.clear());

  // A real record's own payload always carries its own updatedAt -- that is
  // what the OUTGOING side (getSyncBatch) reads to decide what changed, so
  // it always matches the envelope's updatedAt exactly.
  function record(kind, id, updatedAt, payload) {
    return { id, kind, updatedAt, payload: { ...payload, updatedAt } };
  }

  it("adds a record new to this device", () => {
    const { applied } = db.applyIncoming([
      record("customer", "c1", "2026-01-01T00:00:00.000Z", { id: "c1", name: "Musa" }),
    ]);
    expect(applied).toBe(1);
    expect(db.getCustomers().map((c) => c.id)).toEqual(["c1"]);
  });

  it("a newer version replaces an older one, and an older one is ignored", () => {
    db.applyIncoming([record("customer", "c1", "2026-01-01T00:00:00.000Z", { id: "c1", name: "Musa" })]);
    db.applyIncoming([record("customer", "c1", "2025-01-01T00:00:00.000Z", { id: "c1", name: "Stale" })]);
    expect(db.getCustomers()[0].name).toBe("Musa");

    db.applyIncoming([record("customer", "c1", "2026-06-01T00:00:00.000Z", { id: "c1", name: "Musa II" })]);
    expect(db.getCustomers()[0].name).toBe("Musa II");
  });

  it("deletes a record the other side removed", () => {
    db.applyIncoming([record("customer", "c1", "2026-01-01T00:00:00.000Z", { id: "c1" })]);
    db.applyIncoming([{ id: "c1", kind: "customer", updatedAt: "2026-01-02T00:00:00.000Z", deleted: true }]);
    expect(db.getCustomers()).toHaveLength(0);
  });

  it("a tombstone beats a write that arrives after it, even though the write is older", () => {
    // Two devices, one record: this one deletes it, then goes offline. The
    // other device, still holding its own earlier copy, edits it before ever
    // seeing the delete, and that edit only arrives here later. The edit is
    // OLDER than the delete, so the record must stay gone -- a device with a
    // stale copy syncing back in must never resurrect something the account
    // already decided was deleted.
    storage.setItem(
      db.KEYS.tombstones,
      JSON.stringify([{ id: "c1", kind: "customer", deletedAt: "2026-01-02T00:00:00.000Z" }])
    );
    const { applied } = db.applyIncoming([
      record("customer", "c1", "2026-01-01T00:00:00.000Z", { id: "c1", name: "Stale edit" }),
    ]);
    expect(applied).toBe(0);
    expect(db.getCustomers()).toHaveLength(0);
  });

  it("reissues an incoming invoice number that collides with one already here", () => {
    storage.setItem(db.KEYS.sales, JSON.stringify([{ id: "local", invoice: "INV-00001", items: [], total: 10 }]));
    db.applyIncoming([
      record("sale", "incoming", "2026-01-01T00:00:00.000Z", { id: "incoming", invoice: "INV-00001", items: [], total: 99 }),
    ]);

    const sales = db.getSales();
    expect(sales).toHaveLength(2);
    const invoices = sales.map((s) => s.invoice);
    expect(new Set(invoices).size).toBe(2);
    // the record already here keeps its number -- whatever already printed
    // it, or looked it up by it, is holding that copy
    expect(sales.find((s) => s.id === "local").invoice).toBe("INV-00001");
    expect(sales.find((s) => s.id === "incoming").invoice).not.toBe("INV-00001");
  });

  it("does the same for a repair ticket number", () => {
    storage.setItem(db.KEYS.repairs, JSON.stringify([{ id: "local", ticket: "TKT-00001", device: "x" }]));
    db.applyIncoming([
      record("repair", "incoming", "2026-01-01T00:00:00.000Z", { id: "incoming", ticket: "TKT-00001", device: "y" }),
    ]);

    const repairs = db.getRepairs();
    expect(repairs).toHaveLength(2);
    const tickets = repairs.map((r) => r.ticket);
    expect(new Set(tickets).size).toBe(2);
    expect(repairs.find((r) => r.id === "local").ticket).toBe("TKT-00001");
    expect(repairs.find((r) => r.id === "incoming").ticket).not.toBe("TKT-00001");
  });

  it("never renumbers a record this device already knows, only a genuinely new one", () => {
    db.applyIncoming([
      record("sale", "s1", "2026-01-01T00:00:00.000Z", { id: "s1", invoice: "INV-00001", items: [], total: 10 }),
    ]);
    // The same record, edited, arrives again -- same id, so it is an update,
    // not a second sale that happens to share a number.
    db.applyIncoming([
      record("sale", "s1", "2026-01-02T00:00:00.000Z", { id: "s1", invoice: "INV-00001", items: [], total: 20 }),
    ]);
    const sales = db.getSales();
    expect(sales).toHaveLength(1);
    expect(sales[0].invoice).toBe("INV-00001");
    expect(sales[0].total).toBe(20);
  });

  it("moves the counter past a reissued number so the next LOCAL sale can't collide", () => {
    storage.setItem(db.KEYS.sales, JSON.stringify([{ id: "local", invoice: "INV-00001", items: [], total: 10 }]));
    db.applyIncoming([
      record("sale", "incoming", "2026-01-01T00:00:00.000Z", { id: "incoming", invoice: "INV-00001", items: [], total: 99 }),
    ]);
    const next = db.createSale({ items: [], total: 0 });
    expect(next.invoice).not.toBe("INV-00001");
    expect(db.getSales().map((s) => s.invoice).filter((i) => i === next.invoice)).toHaveLength(1);
  });

  it("ignores records with no updatedAt rather than crashing", () => {
    expect(() => db.applyIncoming([{ id: "c1", kind: "customer", payload: { id: "c1" } }])).not.toThrow();
    expect(db.getCustomers()).toHaveLength(0);
  });
});
