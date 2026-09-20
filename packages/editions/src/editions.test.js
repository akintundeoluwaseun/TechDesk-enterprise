import { describe, it, expect } from "vitest";
import {
  FEATURES, CAPABILITIES, EDITIONS, EDITION_META,
  capabilitiesOf, isEdition, defineFlags,
} from "./capabilities";

describe("the tiers are a chain", () => {
  // The product is sold as "everything in Solo, plus...". If that ever stops
  // being literally true, an upgrade takes something away, and the customer
  // who paid for it is the one who finds out.
  it("business has everything solo has", () => {
    for (const f of CAPABILITIES.solo) expect(CAPABILITIES.business).toContain(f);
  });

  it("enterprise has everything business has", () => {
    for (const f of CAPABILITIES.business) expect(CAPABILITIES.enterprise).toContain(f);
  });

  it("each tier adds something, or it is not a tier", () => {
    expect(CAPABILITIES.business.length).toBeGreaterThan(CAPABILITIES.solo.length);
    expect(CAPABILITIES.enterprise.length).toBeGreaterThan(CAPABILITIES.business.length);
  });
});

describe("the list is the only source of truth", () => {
  it("every capability granted is a capability that exists", () => {
    // A typo in a tier's list would otherwise grant a feature that no call
    // site asks for, and silently withhold the one that was meant.
    for (const edition of EDITIONS) {
      for (const f of CAPABILITIES[edition]) expect(FEATURES).toContain(f);
    }
  });

  it("every edition has a name, an id and a lane", () => {
    for (const edition of EDITIONS) {
      expect(EDITION_META[edition].productName).toMatch(/^TechDesk /);
      expect(EDITION_META[edition].appId).toBe(`com.techdesk.${edition}`);
      expect(EDITION_META[edition].versionLane).toBeGreaterThan(0);
    }
  });

  it("the shop itself is in every edition", () => {
    // Whatever else is sold, none of these are.
    for (const f of ["sales", "repairs", "inventory", "customers", "reports", "receipts", "backup"]) {
      for (const edition of EDITIONS) expect(CAPABILITIES[edition]).toContain(f);
    }
  });
});

describe("an unknown edition is never guessed at", () => {
  it("refuses rather than falling back", () => {
    // Falling back to solo would ship a crippled binary labelled Enterprise;
    // falling back to enterprise would give it away. Neither is discoverable
    // until a customer finds it.
    expect(() => capabilitiesOf("buisness")).toThrow(/Unknown edition/);
    expect(() => capabilitiesOf(undefined)).toThrow(/Unknown edition/);
    expect(isEdition("enterprise")).toBe(true);
    expect(isEdition("pro")).toBe(false);
  });
});

describe("the build constants", () => {
  it("are literals, so a bundler can delete the branch behind them", () => {
    const solo = defineFlags("solo");
    // JSON strings, not booleans: this is what goes into a bundler's define,
    // and a real boolean there would be substituted as [object Object].
    expect(solo.__CAN_HQ__).toBe("false");
    expect(solo.__CAN_SALES__).toBe("true");
    expect(solo.__TECHDESK_EDITION__).toBe('"solo"');
  });

  it("covers every feature, so no call site reads an undefined global", () => {
    const flags = defineFlags("business");
    for (const f of FEATURES) {
      expect(flags).toHaveProperty(`__CAN_${f.toUpperCase()}__`);
    }
  });

  it("gives each edition the paid features it paid for", () => {
    expect(defineFlags("solo").__CAN_LAN__).toBe("false");
    expect(defineFlags("business").__CAN_LAN__).toBe("false");
    expect(defineFlags("business").__CAN_HQ__).toBe("true");
    expect(defineFlags("enterprise").__CAN_LAN__).toBe("true");
  });

  it("carries the staff limit, which is the difference nobody can see in a list", () => {
    expect(defineFlags("solo").__TECHDESK_STAFF_LIMIT__).toBe("1");
    expect(defineFlags("business").__TECHDESK_STAFF_LIMIT__).toBe("3");
    // Infinity has no JSON form. It must reach the bundle as the literal,
    // not as "null" -- `count < null` is false, so unlimited would have
    // become a limit of zero in the edition sold on not having one.
    expect(defineFlags("enterprise").__TECHDESK_STAFF_LIMIT__).toBe("Infinity");
    expect(Number(eval(defineFlags("enterprise").__TECHDESK_STAFF_LIMIT__))).toBe(Infinity);
    expect(4 < eval(defineFlags("enterprise").__TECHDESK_STAFF_LIMIT__)).toBe(true);
  });
});
