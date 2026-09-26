import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "./storage";
import {
  REMINDER_INTERVAL_MS, getLastRemindedAt, setLastRemindedAt, dueForReminder,
} from "./owedReminder";

beforeEach(() => storage.clear());

describe("dueForReminder", () => {
  it("is due the first time, before any reminder has ever gone out", () => {
    expect(dueForReminder(null)).toBe(true);
  });

  it("is not due again until three hours have actually passed", () => {
    const now = Date.parse("2026-09-21T12:00:00.000Z");
    const lastRemindedAt = new Date(now - REMINDER_INTERVAL_MS + 60_000).toISOString(); // 1 min short
    expect(dueForReminder(lastRemindedAt, now)).toBe(false);
  });

  it("is due again exactly on the three-hour mark, and after it", () => {
    const now = Date.parse("2026-09-21T12:00:00.000Z");
    const lastRemindedAt = new Date(now - REMINDER_INTERVAL_MS).toISOString();
    expect(dueForReminder(lastRemindedAt, now)).toBe(true);
    expect(dueForReminder(new Date(now - REMINDER_INTERVAL_MS - 1).toISOString(), now)).toBe(true);
  });

  it("treats a corrupted timestamp as due, rather than silently going quiet forever", () => {
    expect(dueForReminder("not a real date")).toBe(true);
  });
});

describe("the persisted clock", () => {
  it("starts unset", () => {
    expect(getLastRemindedAt()).toBeNull();
  });

  it("remembers what was set, on this device's own storage", () => {
    setLastRemindedAt("2026-09-21T12:00:00.000Z");
    expect(getLastRemindedAt()).toBe("2026-09-21T12:00:00.000Z");
  });
});
