import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { onArrived } from "./arrivals";
import { setAuthorName, deviceId } from "./author";
import { arrivalAlert, arrivalAlerts, reminderAlerts, takeDue } from "./alerts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-09-29T12:00:00.000Z");
const ago = (days) => new Date(NOW - days * DAY).toISOString();

beforeEach(() => storage.clear());

describe("who made it", () => {
  it("stamps a new sale and repair with the signed-in name and this device", () => {
    setAuthorName("Ade");
    const sale = db.createSale({ total: 5000, items: [] });
    const job = db.createRepair({ device: "iPhone 11" });
    expect(sale).toMatchObject({ byName: "Ade", byDevice: deviceId() });
    expect(job).toMatchObject({ byName: "Ade", byDevice: deviceId() });
  });

  it("remembers when a job was finished, and forgets it if reopened", () => {
    const job = db.createRepair({ device: "Laptop" });
    const done = db.updateRepair(job.id, { status: "completed" });
    expect(done.readyAt).toBeTruthy();
    expect(db.updateRepair(job.id, { paymentStatus: "Paid" }).readyAt).toBe(done.readyAt);
    expect(db.updateRepair(job.id, { status: "in progress" }).readyAt).toBeUndefined();
  });
});

describe("arrivals from other devices", () => {
  const rec = (id, payload) => ({ kind: "sale", id, updatedAt: new Date().toISOString(), payload: { id, ...payload } });

  it("announces a sale someone else made, but not one of this device's own", () => {
    const heard = [];
    const off = onArrived((items) => heard.push(...items));
    db.applyIncoming([
      rec("s1", { byName: "Ade", byDevice: "other-till", total: 9000 }),
      rec("s2", { byName: "Me", byDevice: deviceId(), total: 100 }),
    ]);
    off();
    expect(heard.map((h) => h.record.id)).toEqual(["s1"]);
  });

  it("does not announce an edit to a sale already here", () => {
    db.applyIncoming([rec("s1", { byDevice: "other", total: 1 })]);
    const heard = [];
    const off = onArrived((items) => heard.push(...items));
    db.applyIncoming([{ ...rec("s1", { byDevice: "other", total: 2 }), updatedAt: new Date(Date.now() + 1000).toISOString() }]);
    off();
    expect(heard).toEqual([]);
  });

  it("reads like a person said it, with the sale's details", () => {
    const a = arrivalAlert({
      kind: "sale",
      record: { id: "s1", byName: "Ade", total: 12500, items: [{ name: "Screen guard", qty: 2 }, { name: "Case" }], customerName: "Bola", paymentStatus: "Unpaid" },
    });
    expect(a.title).toBe("Ade made a sale");
    expect(a.body).toContain("2 × Screen guard +1 more");
    expect(a.body).toContain("to Bola");
    expect(a.body).toContain("unpaid");
  });

  it("leaves out old history a new device pulls on its first sync", () => {
    const fresh = { kind: "sale", record: { id: "a", createdAt: ago(0.1) } };
    const old = { kind: "sale", record: { id: "b", createdAt: ago(5) } };
    expect(arrivalAlerts([fresh, old], {}, { now: NOW }).map((a) => a.id)).toEqual(["sale:a"]);
  });
});

describe("reminders", () => {
  const sales = [
    { id: "s1", customerName: "Bola", total: 20000, amountPaid: 5000, paymentStatus: "Partial", createdAt: ago(5), invoice: "INV-00012" },
    { id: "s2", customerName: "Tunde", total: 3000, paymentStatus: "Unpaid", createdAt: new Date(NOW - 2 * HOUR).toISOString() },   // under 5 hours
    { id: "s3", customerName: "Paid Pat", total: 3000, paymentStatus: "Paid", createdAt: ago(9) },
  ];
  const repairs = [
    { id: "r1", customerName: "Chidi", device: "laptop", status: "completed", readyAt: ago(4), createdAt: ago(10), paymentStatus: "Paid", repairCost: 1 },
    { id: "r2", customerName: "Ngozi", device: "phone", status: "in progress", createdAt: ago(8), paymentStatus: "Unpaid", repairCost: 0 },
    { id: "r3", customerName: "Musa", device: "tablet", status: "completed", readyAt: new Date(NOW - 7 * HOUR).toISOString(), createdAt: ago(2), paymentStatus: "Paid", repairCost: 1 },
  ];

  it("finds who hasn't paid and who hasn't collected, from five hours on", () => {
    const list = reminderAlerts(sales, repairs, { now: NOW });
    // Oldest first. Tunde's sale is two hours old: not yet.
    expect(list.map((a) => a.title)).toEqual([
      "Bola hasn't paid",
      "Chidi hasn't come for their laptop",
      "Musa hasn't come for their tablet",
    ]);
    expect(list.find((a) => a.kind === "owed").body).toMatch(/15,000 owed since 24 Sep · INV-00012/);
    expect(list.find((a) => a.id === "ready:r1").body).toMatch(/^Ready for 4 days/);
    expect(list.find((a) => a.id === "ready:r3").body).toMatch(/^Ready for 7 hours/);
  });

  it("stops the moment it's paid or collected", () => {
    const paid = sales.map((s) => ({ ...s, paymentStatus: "Paid" }));
    const collected = repairs.map((r) => ({ ...r, status: "delivered" }));
    expect(reminderAlerts(paid, collected, { now: NOW })).toEqual([]);
  });

  it("repeats every five hours, an arrival only once", () => {
    const alerts = [
      { id: "owed:x", kind: "owed", title: "", body: "" },
      { id: "sale:y", kind: "arrival", title: "", body: "" },
    ];
    expect(takeDue(alerts, { now: NOW })).toHaveLength(2);
    expect(takeDue(alerts, { now: NOW + 4 * HOUR })).toHaveLength(0);
    expect(takeDue(alerts, { now: NOW + 5 * HOUR }).map((a) => a.id)).toEqual(["owed:x"]);
    expect(takeDue(alerts, { now: NOW + 10 * HOUR }).map((a) => a.id)).toEqual(["owed:x"]);
  });

  it("folds a pile of them into a few plus one summary", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `owed:${i}`, kind: "owed", title: `t${i}`, body: "" }));
    const out = takeDue(many, { now: NOW });
    expect(out).toHaveLength(3);
    expect(out[2].title).toBe("6 more need a look");
    expect(out[2].body).toBe("6 more unpaid");
  });
});
