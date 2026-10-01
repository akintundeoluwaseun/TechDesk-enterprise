import { describe, it, expect, beforeEach } from "vitest";
import { pageTourKey, pageTourSeen, markPageTourSeen, pageTourSteps, resetPageTours } from "./pageTours";

beforeEach(() => localStorage.clear());

describe("a quick tour the first time each page is opened", () => {
  it("knows which page, and which Settings tab", () => {
    expect(pageTourKey("/")).toBe(null);
    expect(pageTourKey("/repairs")).toBe("repairs");
    expect(pageTourKey("/settings", "")).toBe("settings-shop");
    expect(pageTourKey("/settings", "?tab=device")).toBe("settings-device");
  });

  it("shows once, then never again on its own", () => {
    expect(pageTourSeen("inventory")).toBe(false);
    markPageTourSeen("inventory");
    expect(pageTourSeen("inventory")).toBe(true);
    resetPageTours();
    expect(pageTourSeen("inventory")).toBe(false);
  });

  it("Repairs shows where to download the ticket", () => {
    const steps = pageTourSteps("repairs", { desktop: false });
    const ticket = steps.find((s) => s.target === "repair-actions");
    expect(ticket.title).toMatch(/Download the repair ticket/);
    expect(ticket.body).toMatch(/^Tap the ticket icon/);
  });

  it("has a tour for every page and tab", () => {
    for (const k of ["sales", "repairs", "inventory", "customers", "reports", "activity",
      "settings-shop", "settings-users", "settings-device", "settings-account"]) {
      expect(pageTourSteps(k).length, k).toBeGreaterThan(0);
    }
  });
});
