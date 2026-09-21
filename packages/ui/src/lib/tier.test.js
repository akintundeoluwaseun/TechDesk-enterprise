import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FREE_TIER, currentTier, setCurrentTier, onTierChange,
  can, unlockedBy, nextTier, currentStaffLimit,
} from "./tier";

beforeEach(() => setCurrentTier(FREE_TIER));

describe("a shop that has never paid", () => {
  it("starts free, not locked", () => {
    expect(currentTier()).toBe("free");
    for (const f of ["sales", "repairs", "inventory", "customers", "reports", "backup"]) {
      expect(can(f)).toBe(true);
    }
  });

  it("can print a receipt but not save or send it", () => {
    expect(can("receiptPrint")).toBe(true);
    expect(can("receiptPdf")).toBe(false);
    expect(can("receiptShare")).toBe(false);
  });

  it("has no staff accounts and no head office", () => {
    expect(can("staff")).toBe(false);
    expect(can("hq")).toBe(false);
    expect(currentStaffLimit()).toBe(1);
  });
});

describe("paying unlocks the app already installed", () => {
  it("opens the features without a reinstall", () => {
    setCurrentTier("business");
    expect(can("receiptPdf")).toBe(true);
    expect(can("shareData")).toBe(true);
    expect(can("staff")).toBe(true);
    // Still not Enterprise, and head office is Enterprise now.
    expect(can("hq")).toBe(false);
    expect(can("lan")).toBe(false);
  });

  it("tells whatever is on screen, so the lock comes off without a restart", () => {
    // Being told to restart right after paying is the moment a shop starts
    // wondering whether it worked.
    const seen = [];
    const off = onTierChange((t) => seen.push(t));
    setCurrentTier("business");
    setCurrentTier("enterprise");
    off();
    setCurrentTier("free");
    expect(seen).toEqual(["business", "enterprise"]);
  });

  it("one broken listener does not stop the others hearing it", () => {
    const seen = [];
    const offBad = onTierChange(() => { throw new Error("boom"); });
    const offGood = onTierChange((t) => seen.push(t));
    setCurrentTier("business");
    offBad(); offGood();
    expect(seen).toEqual(["business"]);
  });
});

describe("nothing is ever silently upgraded", () => {
  it("an unknown tier falls back to free, never to paid", () => {
    setCurrentTier("enterprise");
    setCurrentTier("platinum");
    expect(currentTier()).toBe("free");
    expect(can("hq")).toBe(false);
  });

  it("a misspelled feature is a no", () => {
    setCurrentTier("enterprise");
    expect(can("h q")).toBe(false);
    expect(can("")).toBe(false);
  });
});

describe("a locked control can say what opens it", () => {
  it("names the tier", () => {
    expect(unlockedBy("receiptPdf")).toBe("business");
    expect(unlockedBy("lan")).toBe("enterprise");
    expect(nextTier("free")).toBe("business");
    expect(nextTier("enterprise")).toBe(null);
  });
});

describe("the tier is not decided by the build", () => {
  it("one build, no edition baked in", () => {
    // The whole product model depends on this: a shop pays and the copy they
    // already have unlocks. Code that is not in the binary cannot be
    // switched on, so nothing may compile the tier away.
    // Both shells. One app, one tier, and no build that decides it.
    for (const shell of ["desktop", "mobile"]) {
      const vite = readFileSync(
        resolve(__dirname, "../../../../apps", shell, "vite.config.mjs"), "utf-8");
      expect(vite).not.toMatch(/defineFlags|__CAN_|TECHDESK_EDITION/);
    }
    const tier = readFileSync(resolve(__dirname, "tier.js"), "utf-8");
    expect(tier).not.toMatch(/__CAN_|__TECHDESK_EDITION__/);
  });
});
