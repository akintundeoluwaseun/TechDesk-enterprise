import { describe, it, expect, beforeEach, vi } from "vitest";
import { formatLocal, loadLocalPrice } from "./localPrice";

beforeEach(() => localStorage.clear());

describe("prices in the shop's own money", () => {
  it("converts Naira at the rate, rounding sensibly", () => {
    expect(formatLocal(10000, { currency: "USD", rate: 0.00065 })).toMatch(/\$6\.50/);
    expect(formatLocal(10000, { currency: "CNY", rate: 0.0047 })).toMatch(/47/);
    expect(formatLocal(10000, { currency: "CNY", rate: 0.0047 })).not.toMatch(/47\.00/);
  });
  it("adds nothing in Nigeria, for nothing, or without a rate", () => {
    expect(formatLocal(10000, { currency: "NGN", rate: 1 })).toBeNull();
    expect(formatLocal(10000, null)).toBeNull();
    expect(formatLocal(0, { currency: "USD", rate: 0.00065 })).toBeNull();
  });
  it("asks the website once, then keeps the answer", async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ country: "US", currency: "USD", rate: 0.00065 }) }));
    expect((await loadLocalPrice(f)).currency).toBe("USD");
    expect((await loadLocalPrice(f)).currency).toBe("USD");
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toMatch(/\/api\/local-price$/);
  });
  it("offline is just Naira", async () => {
    expect(await loadLocalPrice(async () => { throw new Error("offline"); })).toBeNull();
  });
});
