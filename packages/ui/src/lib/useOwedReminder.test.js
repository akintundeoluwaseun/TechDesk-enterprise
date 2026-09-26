import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { db } from "./db";
import { storage } from "@techdesk/core";
import { useOwedReminder } from "./useOwedReminder";

// `resolveTo` simulates what the person actually decides when asked --
// separate from `permission`, the state BEFORE they answer, because a real
// requestPermission() resolves to the person's choice, not an echo of
// whatever Notification.permission already said.
function stubNotification(permission, resolveTo = permission) {
  const instances = [];
  class FakeNotification {
    static permission = permission;
    static requestPermission = vi.fn(() => Promise.resolve(resolveTo));
    constructor(title, options) {
      instances.push({ title, ...options });
    }
  }
  window.Notification = FakeNotification;
  return instances;
}

beforeEach(() => {
  storage.clear();
});

afterEach(() => {
  delete window.Notification;
  vi.restoreAllMocks();
});

describe("useOwedReminder", () => {
  it("shows nothing when nothing is owed", () => {
    const instances = stubNotification("granted");
    renderHook(() => useOwedReminder());
    expect(instances).toHaveLength(0);
  });

  it("shows a real notification, naming the count and the total, when something is owed and permission is already granted", () => {
    db.createSale({ items: [], total: 5000, paymentStatus: "Pending" });
    const instances = stubNotification("granted");
    renderHook(() => useOwedReminder());
    expect(instances).toHaveLength(1);
    expect(instances[0].body).toMatch(/1 payment /);
    expect(instances[0].body).toMatch(/5,000/);
  });

  it("asks for permission only when there is something real to report, never before", async () => {
    const instances = stubNotification("default");
    renderHook(() => useOwedReminder());
    expect(window.Notification.requestPermission).not.toHaveBeenCalled();
    expect(instances).toHaveLength(0);
  });

  it("asks for permission when something is owed, and shows it once granted", async () => {
    db.createRepair({ device: "iPhone 11", repairCost: 4000, paymentStatus: "Unpaid" });
    const instances = stubNotification("default", "granted");
    renderHook(() => useOwedReminder());
    expect(window.Notification.requestPermission).toHaveBeenCalledTimes(1);
    // requestPermission resolves asynchronously, same as the real API --
    // wait for that exact promise rather than guessing how many microtask
    // ticks the .then chain needs.
    await window.Notification.requestPermission.mock.results[0].value;
    await Promise.resolve();
    expect(instances).toHaveLength(1);
  });

  it("never asks again once the shop has said no", () => {
    db.createSale({ items: [], total: 5000, paymentStatus: "Pending" });
    const instances = stubNotification("denied");
    renderHook(() => useOwedReminder());
    expect(window.Notification.requestPermission).not.toHaveBeenCalled();
    expect(instances).toHaveLength(0);
  });

  it("does not remind again within the same three-hour stretch", () => {
    db.createSale({ items: [], total: 5000, paymentStatus: "Pending" });
    storage.setItem("techdesk_owed_reminder_last_at", new Date().toISOString());
    const instances = stubNotification("granted");
    renderHook(() => useOwedReminder());
    expect(instances).toHaveLength(0);
  });
});
