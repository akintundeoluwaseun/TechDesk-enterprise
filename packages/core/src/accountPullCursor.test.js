import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

// Pulling follows synced_at, which the server stamps when a row lands, not
// updated_at, the editing device's own clock. A sale rung up offline and
// uploaded an hour later carries an updated_at an hour old; following that,
// every device whose cursor had already moved on would never see the sale.

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

beforeEach(() => vi.stubGlobal("localStorage", fakeLocalStorage()));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("pull cursor", () => {
  it("asks for rows that arrived since the cursor, and moves it by arrival", async () => {
    const { accountLocal } = await import("./accountLocal");
    localStorage.setItem("techdesk_web_account", JSON.stringify({ email: "a@b.c", accessToken: "t", refreshToken: "r" }));
    const urls = [];
    vi.stubGlobal("fetch", vi.fn((url) => {
      urls.push(String(url));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [
          { record_id: "s9", kind: "sale", payload: { id: "s9" }, deleted: false,
            updated_at: "2026-09-29T10:00:00Z", synced_at: "2026-09-29T11:00:00.123456Z" },
        ],
      });
    }));

    const res = await accountLocal.pull("2026-09-29T10:30:00Z");
    expect(urls[0]).toContain("order=synced_at.asc");
    expect(urls[0]).toContain(`synced_at=gt.${encodeURIComponent("2026-09-29T10:30:00Z")}`);
    expect(urls[0]).not.toContain("updated_at=gt");
    expect(res.cursor).toBe("2026-09-29T11:00:00.123456Z");
  });
});

describe("a worker the shop removed", () => {
  async function workerDevice(rows) {
    const { accountLocal } = await import("./accountLocal");
    localStorage.setItem("techdesk_web_account", JSON.stringify({ accessToken: "t", refreshToken: "r", role: "worker", businessId: "biz" }));
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(
      rows === "offline" ? Promise.reject(new Error("offline")) : { ok: true, status: 200, json: async () => rows },
    )));
    return accountLocal;
  }

  it("still belongs while their membership row is there", async () => {
    expect(await (await workerDevice([{ name: "Ade", pages: ["sales"] }])).checkMembership()).toEqual({ ok: true, member: true });
  });

  it("is told they were removed when it is gone", async () => {
    expect(await (await workerDevice([])).checkMembership()).toEqual({ ok: true, member: false });
  });

  it("never reads offline as removed", async () => {
    expect((await (await workerDevice("offline")).checkMembership()).ok).toBe(false);
  });
});
