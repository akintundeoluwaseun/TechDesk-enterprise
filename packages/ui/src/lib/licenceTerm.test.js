import { describe, it, expect } from "vitest";
import { effectiveTier, licenceActive, daysLeft, YEARLY_FROM, GRACE_DAYS } from "./licenceTerm";

const DAY = 24 * 60 * 60 * 1000;
const NOW = YEARLY_FROM + 100 * DAY;
const iso = (t) => new Date(t).toISOString();
const lic = (tier, endsIn) => ({ found: true, tier, expiresAt: iso(NOW + endsIn * DAY), checkedAt: iso(NOW) });

describe("what a shop keeps", () => {
  it("free stays free", () => {
    expect(effectiveTier({ bought: "free", now: NOW })).toBe("free");
  });

  it("a code bought before yearly plans is for good, licence or not", () => {
    const unlocks = [{ tier: "business", at: iso(YEARLY_FROM - DAY), code: "x" }];
    expect(effectiveTier({ bought: "business", unlocks, now: NOW })).toBe("business");
    expect(effectiveTier({ bought: "business", unlocks, licence: lic("business", -30), now: NOW })).toBe("business");
  });

  it("the old activation flag with no history is for good", () => {
    expect(effectiveTier({ bought: "business", unlocks: [], now: NOW })).toBe("business");
  });
});

describe("yearly plans", () => {
  const unlocks = [{ tier: "business", at: iso(NOW - 10 * DAY), code: "x" }];

  it("run while the licence runs", () => {
    expect(effectiveTier({ bought: "business", unlocks, licence: lic("business", 200), now: NOW })).toBe("business");
  });

  it("stop the day it ends, even offline, from the cached date", () => {
    expect(effectiveTier({ bought: "business", unlocks, licence: lic("business", -1), now: NOW })).toBe("free");
  });

  it("give a fresh purchase a grace period before the server has confirmed it", () => {
    expect(effectiveTier({ bought: "business", unlocks, licence: null, now: NOW })).toBe("business");
    const old = [{ tier: "business", at: iso(NOW - (GRACE_DAYS + 1) * DAY), code: "x" }];
    expect(effectiveTier({ bought: "business", unlocks: old, licence: null, now: NOW })).toBe("free");
  });

  it("never give more than the codes on this device prove", () => {
    // The server says Enterprise for this PIN, but only a Business code was entered here.
    expect(effectiveTier({ bought: "business", unlocks, licence: lic("enterprise", 200), now: NOW })).toBe("business");
  });

  it("an expired yearly Enterprise falls back to a Business bought for good", () => {
    const history = [
      { tier: "business", at: iso(YEARLY_FROM - 5 * DAY), code: "b" },
      { tier: "enterprise", at: iso(NOW - 50 * DAY), code: "e" },
    ];
    expect(effectiveTier({ bought: "enterprise", unlocks: history, licence: lic("enterprise", -3), now: NOW })).toBe("business");
    expect(effectiveTier({ bought: "enterprise", unlocks: history, licence: lic("enterprise", 30), now: NOW })).toBe("enterprise");
  });

  it("counts the days left", () => {
    expect(daysLeft(lic("business", 12.5), NOW)).toBe(13);
    expect(daysLeft(lic("business", -1), NOW)).toBe(null);
    expect(licenceActive({ found: false }, NOW)).toBe(false);
  });
});
