// What the owner's phone does with a refresh.
//
//   node --test tests/notify.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

// A phone, faked: Preferences and the notification plugin both come from
// dynamic imports, so the module is loaded with stubs in place.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const sent = [];
const { notifyNewActivity, setNotificationsEnabled } = await import("../src/notify.js");

// The plugin is absent here (no Capacitor), so nothing is scheduled -- which
// is the browser case, and must not throw. What is asserted is the DECISION:
// how many items it considered new.
const sale = (id) => ({ id, type: "sale", message: `Sale ${id}`, branch: "Ikeja", at: Date.now() });

test("the first refresh after signing in notifies about nothing", async () => {
  store.clear();
  const n = await notifyNewActivity([sale("a"), sale("b"), sale("c")]);
  assert.equal(n, 0, "an owner opening Monitor must not get a notification per existing sale");
});

test("a sale that arrives after that is new", async () => {
  const n = await notifyNewActivity([sale("d"), sale("a"), sale("b")]);
  assert.equal(n, 1);
});

test("the same sale is not announced twice", async () => {
  const n = await notifyNewActivity([sale("d"), sale("a")]);
  assert.equal(n, 0);
});

test("only things worth interrupting someone for", async () => {
  const n = await notifyNewActivity([
    { id: "e", type: "customer", message: "Customer edited", at: Date.now() },
    { id: "f", type: "repair", message: "Repair completed", at: Date.now() },
  ]);
  assert.equal(n, 1, "a customer record being edited is not worth a notification; a repair is");
});

test("turning them off stops them, and does not save up a backlog", async () => {
  await setNotificationsEnabled(false);
  assert.equal(await notifyNewActivity([sale("g"), sale("h")]), 0);
  await setNotificationsEnabled(true);
  // g and h happened while they were off; they must not all arrive at once.
  assert.equal(await notifyNewActivity([sale("g"), sale("h"), sale("i")]), 1);
});

test("an empty or broken feed does nothing and throws nothing", async () => {
  assert.equal(await notifyNewActivity([]), 0);
  assert.equal(await notifyNewActivity(null), 0);
  assert.equal(await notifyNewActivity(undefined), 0);
});
