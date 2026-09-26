import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { mergeSynced, isSynced } from "./sync";

const KEY_REPAIRS = "techdesk_repairs";
const KEY_INVENTORY = "techdesk_inventory";

beforeEach(() => storage.clear());

function readList(key) {
  try {
    return JSON.parse(storage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

describe("mergeSynced", () => {
  it("adds a record new to this device and stamps it as synced", () => {
    const res = mergeSynced([
      { id: "p1", kind: "product", updatedAt: "2026-01-01T00:00:00.000Z", payload: { id: "p1", name: "Case" }, owner: "Alao Photocopy", ownerId: "d2" },
    ]);
    expect(res.added).toBe(1);
    const rows = readList(KEY_INVENTORY);
    expect(rows[0].sharedFrom).toBe("Alao Photocopy");
    expect(rows[0].sharedSeenAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("removes a record the other side deleted", () => {
    mergeSynced([{ id: "p1", kind: "product", updatedAt: "2026-01-01T00:00:00.000Z", payload: { id: "p1" } }]);
    mergeSynced([{ id: "p1", kind: "product", updatedAt: "2026-01-02T00:00:00.000Z", deleted: true }]);
    expect(readList(KEY_INVENTORY)).toHaveLength(0);
  });

  it("reissues an incoming repair ticket number that collides with one already here", () => {
    storage.setItem(KEY_REPAIRS, JSON.stringify([{ id: "local", ticket: "TKT-00001", device: "x" }]));
    mergeSynced([
      {
        id: "incoming",
        kind: "repair",
        updatedAt: "2026-01-01T00:00:00.000Z",
        payload: { id: "incoming", ticket: "TKT-00001", device: "y" },
        owner: "Alao Photocopy",
        ownerId: "d2",
      },
    ]);

    const repairs = readList(KEY_REPAIRS);
    expect(repairs).toHaveLength(2);
    const tickets = repairs.map((r) => r.ticket);
    expect(new Set(tickets).size).toBe(2);
    // this shop's own ticket keeps its number; the one just arriving from
    // the other shop is the one reissued
    expect(repairs.find((r) => r.id === "local").ticket).toBe("TKT-00001");
    expect(repairs.find((r) => r.id === "incoming").ticket).not.toBe("TKT-00001");
  });

  it("never renumbers a repair this device already knows, only edits it", () => {
    mergeSynced([
      { id: "r1", kind: "repair", updatedAt: "2026-01-01T00:00:00.000Z", payload: { id: "r1", ticket: "TKT-00001", device: "x" } },
    ]);
    mergeSynced([
      { id: "r1", kind: "repair", updatedAt: "2026-01-02T00:00:00.000Z", payload: { id: "r1", ticket: "TKT-00001", device: "x", status: "delivered" } },
    ]);
    const repairs = readList(KEY_REPAIRS);
    expect(repairs).toHaveLength(1);
    expect(repairs[0].ticket).toBe("TKT-00001");
    expect(repairs[0].status).toBe("delivered");
  });
});

describe("isSynced", () => {
  it("is false for a plain local product", () => {
    expect(isSynced({ id: "p1", name: "Case" })).toBe(false);
  });

  it("is true for a product mergeSynced just brought in from a partner", () => {
    mergeSynced([
      {
        id: "p1",
        kind: "product",
        updatedAt: "2026-01-01T00:00:00.000Z",
        payload: { id: "p1", name: "Case" },
        owner: "Alao Photocopy",
        ownerId: "d2",
      },
    ]);
    expect(isSynced(readList(KEY_INVENTORY)[0])).toBe(true);
  });

  it("is false again for this device's own record even after a sync partner edits it", () => {
    // rec.mine: this shop's own product, sent back with somebody else's
    // edit -- still this shop's own stock, not theirs.
    mergeSynced([
      { id: "p1", kind: "product", updatedAt: "2026-01-01T00:00:00.000Z", payload: { id: "p1", name: "Case", stock: 3 }, mine: true },
    ]);
    expect(isSynced(readList(KEY_INVENTORY)[0])).toBe(false);
  });
});

describe("the bug this exists to close: a repair drawing down a partner's stock", () => {
  beforeEach(() => storage.clear());

  it("a product synced in from another shop is never among what db.getInventory() offers a repair or a sale to fit", () => {
    // This shop's own screen, and a partner shop's screen that arrived over
    // a sync link -- both real rows in the same inventory list.
    db.addInventoryItem({ id: "own", name: "Local screen", stock: 5, price: 10000 });
    mergeSynced([
      {
        id: "theirs",
        kind: "product",
        updatedAt: "2026-01-01T00:00:00.000Z",
        payload: { id: "theirs", name: "Partner screen", stock: 5, price: 10000 },
        owner: "Alao Photocopy",
        ownerId: "d2",
      },
    ]);

    const fittable = db.getInventory().filter((p) => !isSynced(p));
    expect(fittable.map((p) => p.id)).toEqual(["own"]);
    // The partner's screen is still a real row -- Inventory can still show
    // it, so a shop can see what a linked partner stocks -- it is just never
    // among what a repair or a sale here can draw down.
    expect(db.getInventory().map((p) => p.id).sort()).toEqual(["own", "theirs"]);
  });
});
