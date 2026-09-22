import { describe, it, expect, beforeEach, vi } from "vitest";
import { sync, mergeSynced, pruneUnreachable, db } from "@techdesk/core";

// Syncing with another device, from this device's side.
//
// The rule that would be quietly catastrophic if it broke is the one about
// what goes back up: a record pulled from the other device must not be pushed
// straight back. Each push marks the sender as the last writer, which makes
// the other side pull it as "changed by somebody else", which makes it push
// -- and the two hand the same record back and forth for as long as both are
// on.

const INVENTORY = "techdesk_inventory";
const REPAIRS = "techdesk_repairs";

function rows(key) {
  return JSON.parse(localStorage.getItem(key) || "[]");
}

function synced(over = {}) {
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

describe("what reaches this device arrives in the lists", () => {
  beforeEach(() => {
    localStorage.clear();
    sync.reset();
  });

  it("puts a synced part in the inventory, marked as theirs", () => {
    mergeSynced([synced()]);
    const [row] = rows(INVENTORY);
    expect(row).toMatchObject({ id: "p-theirs-1", name: "S21 screen", stock: 4 });
    // The badge in the list. Without it a shop cannot tell its own stock from
    // the other device's, which is the whole point of not merging them.
    expect(row.sharedFrom).toBe("Samsung bench");
    // And the owner's id, which is what prune needs when a link is cut.
    expect(row.syncedOwnerId).toBe("dev-sam");
  });

  it("updates one that is already here, and does not duplicate it", () => {
    mergeSynced([synced()]);
    mergeSynced([synced({ payload: { id: "p-theirs-1", name: "S21 screen", stock: 2 },
                          updatedAt: "2026-09-21T10:00:00.000Z" })]);
    expect(rows(INVENTORY)).toHaveLength(1);
    expect(rows(INVENTORY)[0].stock).toBe(2);
  });

  it("never puts an older version over a newer one", () => {
    // Pages can arrive out of order on a bad connection. Going backwards
    // would show a shop a stock count it corrected an hour ago.
    mergeSynced([synced({ payload: { id: "p-theirs-1", stock: 2 },
                          updatedAt: "2026-09-21T10:00:00.000Z" })]);
    mergeSynced([synced({ payload: { id: "p-theirs-1", stock: 4 },
                          updatedAt: "2026-09-21T09:00:00.000Z" })]);
    expect(rows(INVENTORY)[0].stock).toBe(2);
  });

  it("takes one away when the device that owns it deletes it", () => {
    mergeSynced([synced()]);
    mergeSynced([synced({ deleted: true, updatedAt: "2026-09-21T11:00:00.000Z" })]);
    expect(rows(INVENTORY)).toHaveLength(0);
  });

  it("sorts records into the list each kind belongs in", () => {
    mergeSynced([
      synced(),
      synced({ id: "r-theirs-1", kind: "repair", payload: { id: "r-theirs-1", ticket: "R-100" } }),
    ]);
    expect(rows(INVENTORY).map((r) => r.id)).toEqual(["p-theirs-1"]);
    expect(rows(REPAIRS).map((r) => r.id)).toEqual(["r-theirs-1"]);
  });

  it("carries a correction home without badging this device's own record", () => {
    // The record belongs here; somebody else fixed the count. It must not
    // suddenly look like somebody else's stock.
    mergeSynced([synced({ id: "p-mine-1", mine: true, owner: "Me",
                          payload: { id: "p-mine-1", name: "A11 battery", stock: 7 } })]);
    const [row] = rows(INVENTORY);
    expect(row.stock).toBe(7);
    expect(row.sharedFrom).toBeUndefined();
  });

  it("ignores a kind it has no list for", () => {
    // A newer server sending something this build does not know about must
    // not throw away the rest of the page.
    const res = mergeSynced([synced(), { id: "x", kind: "spaceship", payload: {} }]);
    expect(rows(INVENTORY)).toHaveLength(1);
    expect(res.stored).toBe(true);
  });
});

describe("cutting a link empties what it filled", () => {
  beforeEach(() => {
    localStorage.clear();
    sync.reset();
  });

  it("takes out records from somebody who no longer reaches this device", () => {
    // A-B-C. B cuts C, and C's records have to come off A's screen -- and
    // nothing told A, which is why this is driven by who still reaches it
    // rather than by an event.
    mergeSynced([synced(), synced({ id: "p-far-1", ownerId: "dev-far", owner: "Far bench" })]);
    expect(rows(INVENTORY)).toHaveLength(2);

    pruneUnreachable(["dev-sam"]);
    expect(rows(INVENTORY).map((r) => r.id)).toEqual(["p-theirs-1"]);
  });

  it("never takes out a record this device typed itself", () => {
    localStorage.setItem(INVENTORY, JSON.stringify([
      { id: "p-mine-1", name: "A11 battery", updatedAt: "2026-09-21T08:00:00.000Z" },
    ]));
    pruneUnreachable([]);
    expect(rows(INVENTORY).map((r) => r.id)).toEqual(["p-mine-1"]);
  });
});

describe("what goes back up", () => {
  beforeEach(() => {
    localStorage.clear();
    sync.reset();
  });

  it("does not send back a record that only just arrived", () => {
    mergeSynced([synced()]);
    const batch = db.getSyncBatch(null);
    expect(batch.records.map((r) => r.id)).not.toContain("p-theirs-1");
  });

  it("does send it once somebody here changes it", () => {
    mergeSynced([synced()]);
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
    sync.reset();
    vi.restoreAllMocks();
    localStorage.setItem("techdesk_web_hq", JSON.stringify({ token: "devtok-1" }));
  });

  it("sends what was ticked for ONE link, and keeps what the server kept", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, kinds: ["product"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    // Asking for a kind the server will not carry -- the app should end up
    // showing what was actually stored, not what was asked for, or the box
    // sits there ticked on a device that is sending nothing.
    const res = await sync.setKinds("11111111-1111-1111-1111-111111111111", ["product", "sale"]);

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.action).toBe("kinds");
    expect(sent.kinds).toEqual(["product"]);
    expect(sent.linkId).toBe("11111111-1111-1111-1111-111111111111");
    expect(res.kinds).toEqual(["product"]);
  });

  it("moves the cursor only once the records are stored", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, records: [synced()], cursor: "2026-09-21T09:00:00.000Z" }),
    }));
    const res = await sync.pull();
    expect(res).toMatchObject({ ok: true, received: 1, added: 1 });
    expect(sync.status().lastPullAt).toBeTruthy();
  });

  it("keeps the cursor where it was when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const res = await sync.pull();
    expect(res.ok).toBe(false);
    // Nothing fetched, nothing skipped: the same page is asked for next time.
    expect(sync.status().lastPullAt).toBe(null);
  });

  it("will not pull for a device that has no identity yet", async () => {
    localStorage.removeItem("techdesk_web_hq");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await sync.pull();
    expect(res).toMatchObject({ ok: false, error: "not_registered" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
