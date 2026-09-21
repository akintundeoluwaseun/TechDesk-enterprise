import { describe, it, expect, beforeEach, vi } from "vitest";
import { shop, mergeShared, db } from "@techdesk/core";

// Sharing between the benches in one shop, from this device's side.
//
// The rule that would be quietly catastrophic if it broke is the last one: a
// record pulled from the bench next door must not be pushed straight back.
// Each push marks the sender as the last writer, which makes the other side
// pull it as "changed by somebody else", which makes it push -- and two
// devices hand the same record back and forth for as long as both are on.

const INVENTORY = "techdesk_inventory";
const REPAIRS = "techdesk_repairs";

function rows(key) {
  return JSON.parse(localStorage.getItem(key) || "[]");
}

function shared(over = {}) {
  return {
    id: "p-theirs-1",
    kind: "product",
    payload: { id: "p-theirs-1", name: "S21 screen", stock: 4 },
    deleted: false,
    owner: "Samsung bench",
    ownerId: "dev-sam",
    mine: false,
    updatedAt: "2026-09-21T09:00:00.000Z",
    ...over,
  };
}

describe("what the shop shares arrives in the lists", () => {
  beforeEach(() => {
    localStorage.clear();
    shop.reset();
  });

  it("puts a shared part in the inventory, marked as theirs", () => {
    mergeShared([shared()]);
    const [row] = rows(INVENTORY);
    expect(row).toMatchObject({ id: "p-theirs-1", name: "S21 screen", stock: 4 });
    // The badge in the list. Without it a shop cannot tell its own stock from
    // the bench next door's, which is the whole point of not merging them.
    expect(row.sharedFrom).toBe("Samsung bench");
  });

  it("updates one that is already here, and does not duplicate it", () => {
    mergeShared([shared()]);
    mergeShared([shared({ payload: { id: "p-theirs-1", name: "S21 screen", stock: 2 },
                          updatedAt: "2026-09-21T10:00:00.000Z" })]);
    expect(rows(INVENTORY)).toHaveLength(1);
    expect(rows(INVENTORY)[0].stock).toBe(2);
  });

  it("never puts an older version over a newer one", () => {
    // Pages can arrive out of order on a bad connection. Going backwards
    // would show a shop a stock count it corrected an hour ago.
    mergeShared([shared({ payload: { id: "p-theirs-1", stock: 2 },
                          updatedAt: "2026-09-21T10:00:00.000Z" })]);
    mergeShared([shared({ payload: { id: "p-theirs-1", stock: 4 },
                          updatedAt: "2026-09-21T09:00:00.000Z" })]);
    expect(rows(INVENTORY)[0].stock).toBe(2);
  });

  it("takes one away when the bench that owns it deletes it", () => {
    mergeShared([shared()]);
    mergeShared([shared({ deleted: true, updatedAt: "2026-09-21T11:00:00.000Z" })]);
    expect(rows(INVENTORY)).toHaveLength(0);
  });

  it("sorts records into the list each kind belongs in", () => {
    mergeShared([
      shared(),
      shared({ id: "r-theirs-1", kind: "repair", payload: { id: "r-theirs-1", ticket: "R-100" } }),
    ]);
    expect(rows(INVENTORY).map((r) => r.id)).toEqual(["p-theirs-1"]);
    expect(rows(REPAIRS).map((r) => r.id)).toEqual(["r-theirs-1"]);
  });

  it("carries a correction home without badging this device's own record", () => {
    // The record belongs here; somebody else fixed the count. It must not
    // suddenly look like somebody else's stock.
    mergeShared([shared({ id: "p-mine-1", mine: true, owner: "Me",
                          payload: { id: "p-mine-1", name: "A11 battery", stock: 7 } })]);
    const [row] = rows(INVENTORY);
    expect(row.stock).toBe(7);
    expect(row.sharedFrom).toBeUndefined();
  });

  it("ignores a kind it has no list for", () => {
    // A newer server sharing something this build does not know about must
    // not throw away the rest of the page.
    const res = mergeShared([shared(), { id: "x", kind: "spaceship", payload: {} }]);
    expect(rows(INVENTORY)).toHaveLength(1);
    expect(res.stored).toBe(true);
  });
});

describe("what goes back up", () => {
  beforeEach(() => {
    localStorage.clear();
    shop.reset();
  });

  it("does not send back a record that only just arrived", () => {
    mergeShared([shared()]);
    const batch = db.getSyncBatch(null);
    expect(batch.records.map((r) => r.id)).not.toContain("p-theirs-1");
  });

  it("does send it once somebody here changes it", () => {
    mergeShared([shared()]);
    // The shop fixes the count at this bench. Every write stamps updatedAt,
    // which is what puts it past the line.
    const list = rows(INVENTORY);
    list[0] = { ...list[0], stock: 2, updatedAt: "2026-09-21T12:00:00.000Z" };
    localStorage.setItem(INVENTORY, JSON.stringify(list));

    const batch = db.getSyncBatch(null);
    expect(batch.records.map((r) => r.id)).toContain("p-theirs-1");
  });

  it("still sends this device's own records", () => {
    localStorage.setItem(INVENTORY, JSON.stringify([
      { id: "p-mine-1", name: "A11 battery", updatedAt: "2026-09-21T08:00:00.000Z" },
    ]));
    const batch = db.getSyncBatch(null);
    expect(batch.records.map((r) => r.id)).toContain("p-mine-1");
  });
});

describe("asking the server", () => {
  beforeEach(() => {
    localStorage.clear();
    shop.reset();
    vi.restoreAllMocks();
    localStorage.setItem("techdesk_web_hq", JSON.stringify({ token: "devtok-1" }));
  });

  it("sends what was ticked, and keeps what the server kept", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, kinds: ["product"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Asking for a kind the server will not share -- the app should end up
    // showing what was actually stored, not what was asked for, or the box
    // sits there ticked on a shop that is sharing nothing.
    const res = await shop.setSharing(["product", "sale"]);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).kinds).toEqual(["product"]);
    expect(res.kinds).toEqual(["product"]);
    expect(shop.status().kinds).toEqual(["product"]);
  });

  it("moves the cursor only once the records are stored", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, records: [shared()], cursor: "2026-09-21T09:00:00.000Z" }),
    }));
    const res = await shop.pull();
    expect(res).toMatchObject({ ok: true, received: 1, added: 1 });
    expect(shop.status().lastPullAt).toBeTruthy();
  });

  it("keeps the cursor where it was when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const res = await shop.pull();
    expect(res.ok).toBe(false);
    // Nothing fetched, nothing skipped: the same page is asked for next time.
    expect(shop.status().lastPullAt).toBe(null);
  });
});
