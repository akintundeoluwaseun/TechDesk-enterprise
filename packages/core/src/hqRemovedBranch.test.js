import { describe, it, expect, afterEach, vi } from "vitest";

// A branch head office removed: the web and phone builds kept showing
// "connected" and retried a dead token for ever. The desktop already let go.
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("a branch head office no longer knows", () => {
  it("drops the dead connection instead of retrying it", async () => {
    const store = new Map([["techdesk_web_hq", JSON.stringify({ connected: true, token: "dead" })]]);
    vi.stubGlobal("localStorage", {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      json: async () => ({ ok: false, error: "unknown_device", message: "This device is no longer connected to HQ." }),
    })));
    const { hqLocal } = await import("./hqLocal");

    const res = await hqLocal.sync();
    expect(res).toMatchObject({ ok: false, error: "unknown_device", more: false });
    expect((await hqLocal.status()).connected).toBe(false);
  });
});
