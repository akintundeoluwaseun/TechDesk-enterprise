import { describe, it, expect } from "vitest";
import {
  FEATURES, CAPABILITIES, TIERS, TIER_META,
  capabilitiesOf, isTier, tierCan, tierFor, staffLimit,
} from "./capabilities";

describe("the tiers are a chain", () => {
  // The product is sold as "everything you had, plus". If that stops being
  // literally true, an upgrade takes something away, and the shop that paid
  // for it is the one who finds out -- mid-day, with customers waiting.
  it("business keeps everything free had", () => {
    for (const f of CAPABILITIES.free) expect(CAPABILITIES.business).toContain(f);
  });

  it("enterprise keeps everything business had", () => {
    for (const f of CAPABILITIES.business) expect(CAPABILITIES.enterprise).toContain(f);
  });

  it("each tier adds something, or it is not a tier", () => {
    expect(CAPABILITIES.business.length).toBeGreaterThan(CAPABILITIES.free.length);
    expect(CAPABILITIES.enterprise.length).toBeGreaterThan(CAPABILITIES.business.length);
  });
});

describe("what a shop gets without paying", () => {
  // The whole shop, for one person. Someone who never pays a naira still has
  // software worth opening every morning, or the free tier is a demo.
  it("runs the counter", () => {
    for (const f of ["sales", "repairs", "inventory", "customers", "reports", "backup", "search"]) {
      expect(tierCan("free", f)).toBe(true);
    }
  });

  it("can hand a customer a receipt", () => {
    // Printing is free on purpose. A shop that cannot give anyone a receipt
    // is not a shop, and a free tier that useless does not convert either.
    expect(tierCan("free", "receiptPrint")).toBe(true);
  });

  it("cannot save or send one", () => {
    expect(tierCan("free", "receiptPdf")).toBe(false);
    expect(tierCan("free", "receiptShare")).toBe(false);
  });

  it("is one person, sharing with nobody", () => {
    expect(tierCan("free", "staff")).toBe(false);
    expect(tierCan("free", "pin")).toBe(false);
    expect(tierCan("free", "syncData")).toBe(false);
    expect(tierCan("free", "hq")).toBe(false);
    expect(staffLimit("free")).toBe(1);
  });
});

describe("what each paid tier is for", () => {
  it("business is staff, receipts that leave the counter, and one shop sharing", () => {
    for (const f of ["staff", "roles", "pin", "receiptPdf", "receiptShare", "syncData"]) {
      expect(tierCan("business", f)).toBe(true);
    }
    expect(staffLimit("business")).toBe(3);
  });

  // Sideways and upwards are different products. Business shares between the
  // people in one shop; reporting up to an account that watches several shops
  // is the tier above, and a one-counter shop should not be paying for it.
  it("business shares sideways but does not report upwards", () => {
    expect(tierCan("business", "syncData")).toBe(true);
    expect(tierCan("business", "hq")).toBe(false);
  });

  it("enterprise is more than one shop", () => {
    for (const f of ["hq", "lan", "multiBranch", "unlimitedStaff"]) {
      expect(tierCan("enterprise", f)).toBe(true);
      expect(tierCan("business", f)).toBe(false);
    }
    expect(staffLimit("enterprise")).toBe(Infinity);
    // Not "null", not 0. This is the tier sold on not having a limit, and
    // `count < null` is false -- it would have been a limit of zero.
    expect(4 < staffLimit("enterprise")).toBe(true);
  });
});

describe("a locked control can say what opens it", () => {
  it("names the cheapest tier that includes the feature", () => {
    expect(tierFor("receiptPdf")).toBe("business");
    expect(tierFor("syncData")).toBe("business");
    expect(tierFor("hq")).toBe("enterprise");
    expect(tierFor("lan")).toBe("enterprise");
    expect(tierFor("sales")).toBe("free");
  });

  it("says nothing rather than something wrong for an unknown feature", () => {
    expect(tierFor("teleportation")).toBe(null);
  });

  it("every tier but the last offers somewhere to go", () => {
    expect(TIER_META.free.upgradeTo).toBe("business");
    expect(TIER_META.business.upgradeTo).toBe("enterprise");
    expect(TIER_META.enterprise.upgradeTo).toBe(null);
  });
});

describe("the list is the only source of truth", () => {
  it("every capability granted is a capability that exists", () => {
    for (const tier of TIERS) {
      for (const f of CAPABILITIES[tier]) expect(FEATURES).toContain(f);
    }
  });

  it("every feature is reachable by paying for something", () => {
    // A feature in FEATURES that no tier grants is dead code behind a lock
    // nobody can open.
    for (const f of FEATURES) expect(tierFor(f)).not.toBe(null);
  });
});

describe("an unknown tier is never guessed at", () => {
  it("refuses rather than falling back", () => {
    // Falling back to enterprise gives the product away; falling back to free
    // takes away what a shop paid for, in the middle of their day.
    expect(() => capabilitiesOf("buisness")).toThrow(/Unknown tier/);
    expect(() => capabilitiesOf(undefined)).toThrow(/Unknown tier/);
    expect(isTier("free")).toBe(true);
    expect(isTier("pro")).toBe(false);
  });

  it("fails closed on a typo at the call site", () => {
    // A misspelled feature must not grant.
    expect(tierCan("enterprise", "")).toBe(false);
    expect(tierCan("enterprise", "hq ")).toBe(false);
    expect(tierCan("enterprise", "notAFeature")).toBe(false);
  });
});
