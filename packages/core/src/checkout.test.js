import { describe, it, expect, vi, afterEach } from "vitest";
import { checkout } from "./checkout";

afterEach(() => vi.restoreAllMocks());

describe("starting an order", () => {
  it("is available with no native host at all -- there is nowhere it would need one", () => {
    expect(checkout.available()).toBe(true);
  });

  it("returns what the widget needs, on a successful order", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, txRef: "td-1", amount: 8000, currency: "NGN", publicKey: "FLWPUBK-xyz" }),
    })));
    const res = await checkout.startOrder({ pin: "123456", tier: "business", contact: "" });
    expect(res.ok).toBe(true);
    expect(res.txRef).toBe("td-1");
    expect(res.publicKey).toBe("FLWPUBK-xyz");
  });

  it("passes the server's own message through on a rejected order, rather than a generic one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, error: "not_for_sale", message: "That plan is not on sale yet. Please contact us." }),
    })));
    const res = await checkout.startOrder({ pin: "000000", tier: "business", contact: "" });
    expect(res.ok).toBe(false);
    expect(res.message).toBe("That plan is not on sale yet. Please contact us.");
  });

  it("says so plainly when the network itself is the problem", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const res = await checkout.startOrder({ pin: "123456", tier: "business", contact: "" });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/internet/i);
  });
});

describe("claiming the code", () => {
  it("hands back the code once the order is paid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, code: "ABCD1234", tier: "business" }),
    })));
    const res = await checkout.claimCode("td-1");
    expect(res.ok).toBe(true);
    expect(res.code).toBe("ABCD1234");
    expect(res.tier).toBe("business");
  });

  it("reports not_paid rather than throwing while the webhook is still in flight", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, error: "not_paid", message: "We haven't seen the payment yet. Give it a moment and try again." }),
    })));
    const res = await checkout.claimCode("td-1");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("not_paid");
  });
});

describe("one-time codes", () => {
  it("asks the server to use the code for this PIN, with the Business proof", async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => { calls.push([url, JSON.parse(init.body)]); return { ok: true, json: async () => ({ ok: true, tier: "enterprise", expiresAt: "2027-10-05T00:00:00Z" }) }; };
    const { checkout } = await import("./checkout");
    const res = await checkout.redeemOneTimeCode("UPG7K2MQ9TX4HPA", "482913", "ABCD1234EFGH");
    expect(res).toMatchObject({ ok: true, tier: "enterprise" });
    expect(calls[0][0]).toMatch(/rpc\/redeem_one_time_code$/);
    expect(calls[0][1]).toEqual({ p_code: "UPG7K2MQ9TX4HPA", p_pin: "482913", p_business_code: "ABCD1234EFGH" });
  });
  it("says to connect when offline", async () => {
    globalThis.fetch = async () => { throw new Error("offline"); };
    const { checkout } = await import("./checkout");
    expect(await checkout.redeemOneTimeCode("BUS7K2MQ9TX4HPA", "482913")).toMatchObject({ ok: false, error: "offline" });
  });
});
