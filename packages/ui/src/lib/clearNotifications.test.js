import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "./db";
import { notificationFeed } from "@techdesk/core";

// Clear has been "fixed" twice and reported broken twice, because both fixes
// were to the feed function and the bug was at the call site: clearedAt was in
// the useMemo dependency list and not in the call, so clearing re-ran it and
// handed back the unfiltered feed. The marker moved, the badge went quiet, and
// every line stayed exactly where it was.
//
// So this tests the call sites as well as the behaviour. A feed function that
// filters perfectly is worth nothing if nobody tells it what to filter by.
const SURFACES = ["Topbar.jsx", "MobileAppBar.jsx"];

describe("Clear actually clears", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each(SURFACES)("%s passes clearedAt to the feed, not just depends on it", (file) => {
    const src = readFileSync(resolve(__dirname, "../components", file), "utf-8");
    expect(src).toMatch(/notificationFeed\(\s*clearedAt\s*\)/);
    // The exact shape of the old bug: called with nothing.
    expect(src).not.toMatch(/notificationFeed\(\s*\)/);
  });

  // The feed keeps anything at OR AFTER the clear, so these advance the clock
  // by a millisecond where a person would have taken a second. Clearing in the
  // same millisecond as the sale is the deliberate edge case tested last.
  const tick = () => new Promise((r) => setTimeout(r, 2));

  it("empties the list, not just the badge", async () => {
    db.logActivity({ type: "sale", message: "Sold a screen" });
    db.logActivity({ type: "repair", message: "iPhone received" });
    expect(notificationFeed(null).length).toBeGreaterThanOrEqual(2);

    await tick();
    db.clearNotifications();
    const clearedAt = db.getNotifClearedAt();
    expect(clearedAt).toBeTruthy();
    expect(notificationFeed(clearedAt)).toHaveLength(0);
  });

  it("the next sale comes back, so clearing is not muting", async () => {
    db.logActivity({ type: "sale", message: "Old one" });
    await tick();
    db.clearNotifications();
    const clearedAt = db.getNotifClearedAt();
    expect(notificationFeed(clearedAt)).toHaveLength(0);

    await tick();
    db.logActivity({ type: "sale", message: "New one" });
    const after = notificationFeed(clearedAt);
    expect(after).toHaveLength(1);
    expect(after[0].message).toBe("New one");
  });

  it("a sale in the same millisecond as the clear is not swallowed", () => {
    // >= rather than >. Rare, real, and the lost line is one the shop never
    // sees -- they have no way to know it existed.
    const at = new Date().toISOString();
    localStorage.setItem("techdesk_notif_cleared_at", at);
    db.logActivity({ type: "sale", message: "Same instant" });
    const feed = notificationFeed(at).filter((i) => i.message === "Same instant");
    expect(feed).toHaveLength(1);
  });
});
