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
