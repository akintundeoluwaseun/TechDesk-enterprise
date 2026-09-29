import { describe, it, expect, beforeAll } from "vitest";

// What the owner's phone does with a refresh.
//
// Written for vitest, which is what `npm test` runs here. The first version
// of this file used node:test and passed when run with `node --test` -- and
// the suite that actually gates the build could not read it at all. Verified
// the wrong way is not verified.

// Preferences and the notification plugin are both dynamic imports, absent
// outside Capacitor, so this exercises the browser path: nothing is
// scheduled, and what is asserted is the DECISION -- how many items the app
// considered worth interrupting someone for.
const store = new Map();
beforeAll(() => {
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
});

const { notifyNewActivity, setNotificationsEnabled } = await import("./notify.js");
const sale = (id) => ({ id, type: "sale", message: `Sale ${id}`, branch: "Ikeja", at: Date.now() });

describe("notifications off Monitor's own refresh", () => {
  it("announces nothing on the first refresh after signing in", async () => {
    store.clear();
    // Otherwise opening Monitor for the first time delivers one notification
    // per sale already on the screen.
    expect(await notifyNewActivity([sale("a"), sale("b"), sale("c")])).toBe(0);
  });

  it("announces a sale that arrives afterwards", async () => {
    expect(await notifyNewActivity([sale("d"), sale("a"), sale("b")])).toBe(1);
  });

  it("never announces the same sale twice", async () => {
    expect(await notifyNewActivity([sale("d"), sale("a")])).toBe(0);
  });

  it("interrupts for money and repairs, not for a customer record being edited", async () => {
    const n = await notifyNewActivity([
      { id: "e", type: "customer", message: "Customer edited", at: Date.now() },
      { id: "f", type: "repair", message: "Repair completed", at: Date.now() },
    ]);
    expect(n).toBe(1);
  });

  it("stays quiet when turned off, and saves up no backlog", async () => {
    await setNotificationsEnabled(false);
    expect(await notifyNewActivity([sale("g"), sale("h")])).toBe(0);
    await setNotificationsEnabled(true);
    // g and h happened while they were off and must not all arrive at once.
    expect(await notifyNewActivity([sale("g"), sale("h"), sale("i")])).toBe(1);
  });

  it("survives an empty or broken feed", async () => {
    expect(await notifyNewActivity([])).toBe(0);
    expect(await notifyNewActivity(null)).toBe(0);
    expect(await notifyNewActivity(undefined)).toBe(0);
  });
});

describe("sales and reminders from the summary", async () => {
  const { notifyNewSales, notifyReminders, saleNotice, owedNotice, uncollectedNotice } = await import("./notify.js");

  it("says who made the sale, where, and what", () => {
    const n = saleNotice({ id: "s1", by: "Ade", branch: "Ikeja", total: 12500, firstItem: "Screen guard", firstQty: 2, itemCount: 2, customer: "Bola", paymentStatus: "Paid" });
    expect(n.title).toBe("Ade made a sale at Ikeja");
    expect(n.body).toMatch(/12,500 · 2 × Screen guard \+1 more · to Bola$/);
  });

  it("names who owes and who hasn't collected", () => {
    expect(owedNotice({ id: "sale:x", customer: "Tunde", amount: 15000, since: "2026-09-24T10:00:00Z", branch: "Yaba" }).title).toBe("Tunde hasn't paid");
    expect(uncollectedNotice({ id: "r", customer: "Chidi", device: "HP laptop", since: new Date(Date.now() - 4 * 86_400_000).toISOString() }).body).toMatch(/^Ready for 4 days/);
  });

  it("announces only sales it hasn't seen, and none on the first look", async () => {
    store.clear();
    expect(await notifyNewSales([{ id: "a" }])).toBe(0);
    expect(await notifyNewSales([{ id: "b" }, { id: "a" }])).toBe(1);
    expect(await notifyNewSales([{ id: "b" }, { id: "a" }])).toBe(0);
  });

  it("reminds once a day, not every refresh", async () => {
    store.clear();
    const owed = [{ id: "sale:x", customer: "Tunde", amount: 1, since: "2026-09-20T00:00:00Z" }];
    const t = Date.parse("2026-09-29T09:00:00Z");
    expect(await notifyReminders(owed, [], t)).toBe(1);
    expect(await notifyReminders(owed, [], t + 60_000)).toBe(0);
    expect(await notifyReminders(owed, [], t + 86_400_000)).toBe(1);
  });
});
