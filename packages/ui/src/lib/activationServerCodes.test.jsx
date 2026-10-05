import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createHash } from "node:crypto";
import { hashPreimage, HASH_HEX } from "./activationCode";
import { effectiveTier } from "./licenceTerm";

// Two PINs: row 0 is on the owner's list, row 1 is from before the list.
const PINS = ["742318", "905511"];
const BUSINESS = "B1B1-B1B1-B1B1";
const UPGRADE = "U9U9-U9U9-U9U9";
const digest = (pin, tier, code) => createHash("sha256").update(hashPreimage(pin, tier, code)).digest("hex").slice(0, HASH_HEX);

vi.mock("./activationTable", () => ({
  TABLE_TIERS: ["business", "enterprise"],
  TABLE_SIZE: 2,
  POOL_SIZE: 1,
  inPool: (i) => i === 0,
  isValidIndex: (i) => i === 0 || i === 1,
  loadTable: async () => ({ tiers: ["business", "enterprise"], entries: [] }),
  pinAt: async (i) => PINS[i] ?? null,
  hashesAt: async (i) => (PINS[i] ? [
    { tier: "business", hash: digest(PINS[i], "business", BUSINESS) },
    { tier: "enterprise", hash: digest(PINS[i], "enterprise", "E1E1-E1E1-E1E1") },
  ] : []),
}));

const server = { licence: { ok: true, found: false }, calls: [] };
vi.mock("@techdesk/core", async (orig) => {
  const real = await orig();
  return {
    ...real,
    checkout: {
      ...real.checkout,
      licenceStatus: vi.fn(async (pin, proofs) => { server.calls.push(["status", pin, proofs]); return server.licence; }),
      redeemPinCode: vi.fn(async (code, pin) => {
        server.calls.push(["pin", code, pin]);
        const c = code.replace(/-/g, "");
        if (c === BUSINESS.replace(/-/g, "")) { server.licence = { ok: true, found: true, tier: "business", expiresAt: "2027-10-05T00:00:00Z", trial: false, proven: false }; return { ok: true, kind: "business", tier: "business", expiresAt: server.licence.expiresAt }; }
        if (c === UPGRADE.replace(/-/g, "")) { server.licence = { ok: true, found: true, tier: "enterprise", expiresAt: "2027-10-05T00:00:00Z", trial: false, proven: true }; return { ok: true, kind: "upgrade", tier: "enterprise", expiresAt: server.licence.expiresAt }; }
        return { ok: false, error: "not_found" };
      }),
      redeemOneTimeCode: vi.fn(async (code, pin) => {
        server.calls.push(["one-time", code, pin]);
        server.licence = { ok: true, found: true, tier: "business", expiresAt: "2027-10-05T00:00:00Z", trial: false, proven: true };
        return { ok: true, kind: "business", tier: "business", expiresAt: server.licence.expiresAt };
      }),
    },
  };
});

const { LicenseProvider, useLicense } = await import("./LicenseContext");

async function opened() {
  const view = renderHook(() => useLicense(), { wrapper: ({ children }) => <LicenseProvider>{children}</LicenseProvider> });
  await act(async () => {});
  return view;
}
async function type(result, code) {
  let res;
  await act(async () => { res = await result.current.verifyCode(code); });
  return res;
}

beforeEach(() => {
  localStorage.clear();
  server.licence = { ok: true, found: false };
  server.calls = [];
});

describe("codes by PIN", () => {
  it("a Business code from the list starts the year on the server", async () => {
    localStorage.setItem("techdesk_license_index", "0");
    const { result } = await opened();
    const res = await type(result, BUSINESS);
    expect(res).toMatchObject({ ok: true, applied: true, tier: "business" });
    expect(server.calls.some(([k, c, p]) => k === "pin" && c.replace(/-/g, "") === "B1B1B1B1B1B1" && p === PINS[0])).toBe(true);
    await waitFor(() => expect(result.current.tier).toBe("business"));
    expect(result.current.licence?.found).toBe(true);
  });

  it("the Upgrade code for this PIN moves Business to Enterprise", async () => {
    localStorage.setItem("techdesk_license_index", "0");
    const { result } = await opened();
    await type(result, BUSINESS);
    const res = await type(result, UPGRADE);
    expect(res).toMatchObject({ ok: true, applied: true, tier: "enterprise" });
    await waitFor(() => expect(result.current.tier).toBe("enterprise"));
    // Both codes kept: the Business one proves the device, the Upgrade one is vouched for by the server.
    expect(result.current.unlocks.map((u) => u.tier).sort()).toEqual(["business", "enterprise"]);
    expect(result.current.unlocks.find((u) => u.tier === "enterprise").server).toBe(true);
  });

  it("a one-time code really unlocks now (it used to stay Free)", async () => {
    localStorage.setItem("techdesk_license_index", "0");
    const { result } = await opened();
    const res = await type(result, "BUS-AAAA-BBBB-CCCC");
    expect(res).toMatchObject({ ok: true, applied: true, tier: "business" });
    await waitFor(() => expect(result.current.tier).toBe("business"));
    // The device proves it holds the code each time it asks.
    expect(server.calls.filter(([k]) => k === "status").pop()[2]).toEqual(["BUSAAAABBBBCCCC"]);
  });

  it("a wrong code stays wrong", async () => {
    localStorage.setItem("techdesk_license_index", "0");
    const { result } = await opened();
    const res = await type(result, "ZZZZ-ZZZZ-ZZZZ");
    expect(res.ok).toBe(false);
    expect(result.current.tier).toBe("free");
  });
});

describe("PINs from before the list", () => {
  it("move onto the list when the device has never paid", async () => {
    localStorage.setItem("techdesk_license_index", "1");
    const { result } = await opened();
    await waitFor(() => expect(result.current.pin).toBe(PINS[0]));
    expect(localStorage.getItem("techdesk_license_index")).toBe("0");
  });

  it("stay put when the device has paid", async () => {
    localStorage.setItem("techdesk_license_index", "1");
    localStorage.setItem("techdesk_activated", "1");
    const { result } = await opened();
    await waitFor(() => expect(result.current.pin).toBe(PINS[1]));
  });
});

describe("server-checked codes and the licence", () => {
  const unlock = [{ tier: "enterprise", code: "UPGXXXX", at: "2026-10-05T10:00:00Z", server: true }];
  const lic = { found: true, tier: "enterprise", expiresAt: "2027-10-05T00:00:00Z", trial: false };
  const now = Date.parse("2026-10-06T00:00:00Z");
  it("count while the server confirms the device holds the code", () => {
    expect(effectiveTier({ bought: "enterprise", unlocks: unlock, licence: { ...lic, proven: true }, now })).toBe("enterprise");
  });
  it("count for nothing without that proof, or once the year is over", () => {
    expect(effectiveTier({ bought: "enterprise", unlocks: unlock, licence: { ...lic, proven: false }, now })).toBe("free");
    expect(effectiveTier({ bought: "enterprise", unlocks: unlock, licence: { ...lic, proven: true }, now: Date.parse("2027-11-01T00:00:00Z") })).toBe("free");
  });
});
