import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createHash } from "node:crypto";
import { hashPreimage, HASH_HEX, formatCode } from "./activationCode";

// A table of exactly one PIN, whose codes this file knows. The shipped table
// holds hashes only -- by design, nobody can read a code out of the app -- so
// a test that wants to type a real code has to mint its own.
const PIN = "742318";
const CODES = {
  business: "B1B1-B1B1-B1B1",
  enterprise: "E2E2-E2E2-E2E2",
};

function digest(tier) {
  return createHash("sha256").update(hashPreimage(PIN, tier, CODES[tier])).digest("hex").slice(0, HASH_HEX);
}

vi.mock("./activationTable", () => ({
  TABLE_TIERS: ["business", "enterprise"],
  TABLE_SIZE: 1,
  isValidIndex: (i) => i === 0,
  loadTable: async () => ({ tiers: ["business", "enterprise"], entries: [] }),
  // Async, like the real ones: the table is loaded on demand, and a test
  // that stubbed it as synchronous would pass while the app rendered a
  // blank PIN.
  pinAt: async (i) => (i === 0 ? PIN : null),
  hashesAt: async (i) =>
    i === 0
      ? [
          { tier: "business", hash: digest("business") },
          { tier: "enterprise", hash: digest("enterprise") },
        ]
      : [],
}));

const { LicenseProvider, useLicense } = await import("./LicenseContext");
const { setCurrentTier, currentTier, FREE_TIER } = await import("./tier");

function open() {
  return renderHook(() => useLicense(), {
    wrapper: ({ children }) => <LicenseProvider>{children}</LicenseProvider>,
  });
}

/** Render, and let the on-demand table land before looking at the PIN. */
async function opened() {
  const view = open();
  await act(async () => {});
  return view;
}

async function type(result, code) {
  let res;
  await act(async () => {
    res = await result.current.verifyCode(code);
  });
  return res;
}

beforeEach(() => {
  localStorage.clear();
  setCurrentTier(FREE_TIER);
});

describe("a shop that has never paid", () => {
  it("is free, not locked, and can still run the shop", async () => {
    const { result } = await opened();
    expect(result.current.tier).toBe("free");
    expect(result.current.can("sales")).toBe(true);
    expect(result.current.can("receiptPrint")).toBe(true);
    expect(result.current.can("receiptPdf")).toBe(false);
    expect(result.current.can("hq")).toBe(false);
  });

  it("shows the PIN it will read out to pay, once the table has loaded", async () => {
    const { result } = await opened();
    expect(result.current.pin).toBe(PIN);
  });
});

describe("free to Business", () => {
  it("unlocks on the right code", async () => {
    const { result } = await opened();
    const res = await type(result, CODES.business);
    expect(res).toMatchObject({ ok: true, applied: true, tier: "business" });
    expect(result.current.tier).toBe("business");
    expect(result.current.can("receiptPdf")).toBe(true);
    // Still not Enterprise -- one payment buys one tier, and head office is
    // the next one.
    expect(result.current.can("hq")).toBe(false);
    expect(result.current.can("multiBranch")).toBe(false);
  });

  it("lifts the locks without a restart", async () => {
    const { result } = await opened();
    await type(result, CODES.business);
    // tier.js is what the non-component code reads -- the receipt helpers,
    // the sync hook. If it lags, the shop pays and the buttons stay grey.
    expect(currentTier()).toBe("business");
  });

  it("takes the code with dashes, without them, or in lower case", async () => {
    for (const typed of [CODES.business, CODES.business.replace(/-/g, ""), CODES.business.toLowerCase()]) {
      localStorage.clear();
      setCurrentTier(FREE_TIER);
      const { result } = await opened();
      expect(await type(result, typed)).toMatchObject({ ok: true, applied: true });
    }
  });

  it("refuses a code that is not for this PIN", async () => {
    const { result } = await opened();
    const res = await type(result, "ZZZZ-ZZZZ-ZZZZ");
    expect(res).toMatchObject({ ok: false, applied: false, tier: null });
    expect(result.current.tier).toBe("free");
  });

  it("refuses an empty box instead of throwing", async () => {
    const { result } = await opened();
    expect(await type(result, "")).toMatchObject({ ok: false });
    expect(await type(result, null)).toMatchObject({ ok: false });
  });
});

describe("Business to Enterprise, on the same PIN", () => {
  // The whole point of two codes per PIN: the second sale needs no new PIN,
  // no reinstall and no new device identity.
  it("upgrades in place", async () => {
    const { result } = await opened();
    await type(result, CODES.business);
    const res = await type(result, CODES.enterprise);
    expect(res).toMatchObject({ ok: true, applied: true, tier: "enterprise" });
    expect(result.current.tier).toBe("enterprise");
    expect(result.current.can("multiBranch")).toBe(true);
    expect(result.current.can("lan")).toBe(true);
  });

  it("can be bought outright without ever holding Business", async () => {
    const { result } = await opened();
    const res = await type(result, CODES.enterprise);
    expect(res).toMatchObject({ ok: true, applied: true, tier: "enterprise" });
    expect(result.current.can("receiptPdf")).toBe(true);
  });

  it("keeps both unlocks on the record", async () => {
    const { result } = await opened();
    await type(result, CODES.business);
    await type(result, CODES.enterprise);
    expect(result.current.unlocks.map((u) => u.tier)).toEqual(["business", "enterprise"]);
  });
});

describe("a code that buys nothing new", () => {
  it("never downgrades an Enterprise shop back to Business", async () => {
    // The one that costs a customer money: they paid for Enterprise, then
    // somebody at the counter retypes the old Business code out of the
    // WhatsApp thread.
    const { result } = await opened();
    await type(result, CODES.enterprise);
    const res = await type(result, CODES.business);
    expect(res).toMatchObject({ ok: true, applied: false, tier: "business" });
    expect(result.current.tier).toBe("enterprise");
    expect(result.current.can("multiBranch")).toBe(true);
  });

  it("says 'already active' rather than 'wrong code' when it is re-entered", async () => {
    const { result } = await opened();
    await type(result, CODES.business);
    const res = await type(result, CODES.business);
    // ok, because the code is genuine. not applied, because nothing changed.
    expect(res).toMatchObject({ ok: true, applied: false, tier: "business" });
  });

  it("does not add a second line to the record", async () => {
    const { result } = await opened();
    await type(result, CODES.business);
    await type(result, CODES.business);
    expect(result.current.unlocks).toHaveLength(1);
  });
});

describe("a device activated before any of this existed", () => {
  // The old model sold the tier as a separate download, so these installs
  // carry a bare "activated" flag and no record of what was bought.
  it("keeps what it had, at the Business floor", async () => {
    localStorage.setItem("techdesk_activated", "1");
    const { result } = await opened();
    expect(result.current.tier).toBe("business");
    expect(result.current.can("multiBranch")).toBe(false);
  });

  it("can still be moved up by an Enterprise code", async () => {
    localStorage.setItem("techdesk_activated", "1");
    const { result } = await opened();
    expect(await type(result, CODES.enterprise)).toMatchObject({ ok: true, applied: true });
    expect(result.current.tier).toBe("enterprise");
  });

  it("is not knocked back down by the Business code it was sold", async () => {
    localStorage.setItem("techdesk_activated", "1");
    const { result } = await opened();
    expect(await type(result, CODES.business)).toMatchObject({ ok: true, applied: false });
    expect(result.current.tier).toBe("business");
  });
});

describe("what survives", () => {
  it("comes back at the tier that was bought, not just 'activated'", async () => {
    const first = await opened();
    await type(first.result, CODES.enterprise);
    first.unmount();

    // A fresh start of the app, same localStorage.
    setCurrentTier(FREE_TIER);
    const { result } = await opened();
    expect(result.current.tier).toBe("enterprise");
    expect(result.current.can("multiBranch")).toBe(true);
  });

  it("recovers the tier from the unlock history if the flag alone is lost", async () => {
    const first = await opened();
    await type(first.result, CODES.enterprise);
    first.unmount();

    // The exact failure this history exists for: the single word survives as
    // the older, lower value while the record of what was bought does not.
    localStorage.setItem("techdesk_tier", "business");
    setCurrentTier(FREE_TIER);

    const { result } = await opened();
    expect(result.current.tier).toBe("enterprise");
  });
});

describe("the printed form and the typed form are the same code", () => {
  it("accepts exactly what the CSV prints", async () => {
    const { result } = await opened();
    const asSold = formatCode(CODES.enterprise);
    expect(await type(result, asSold)).toMatchObject({ ok: true, applied: true });
  });
});
