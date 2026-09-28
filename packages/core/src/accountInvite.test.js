import { describe, it, expect, afterEach, vi } from "vitest";
import { accountLocal } from "./accountLocal";

function stubFetch(handler) {
  vi.stubGlobal("fetch", vi.fn(handler));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("inviteStart", () => {
  it("refuses with no session, rather than calling out", async () => {
    // No accessToken has ever been saved in this environment (no
    // localStorage under Node -- see accountTransport.test.js), so this is
    // always the "not signed in" path here.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await accountLocal.inviteStart();
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("workerJoin", () => {
  it("refuses an empty shop email without calling out", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await accountLocal.workerJoin("", "123456", "Ade");
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses an empty name without calling out", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await accountLocal.workerJoin("shop@example.com", "123456", "  ");
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts the shop email, the code and the trimmed name to account-invite-redeem", async () => {
    let calledUrl, calledBody;
    stubFetch((url, init) => {
      calledUrl = url;
      calledBody = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ok: true,
          accessToken: "at",
          refreshToken: "rt",
          businessId: "biz-1",
          workerName: "Ade",
        }),
      });
    });

    const res = await accountLocal.workerJoin("shop@example.com", "123456", "  Ade  ");

    expect(String(calledUrl)).toContain("/functions/v1/account-invite-redeem");
    expect(calledBody).toEqual({ email: "shop@example.com", code: "123456", name: "Ade" });
    expect(res).toEqual({ ok: true, workerName: "Ade" });
  });

  it("turns a rejected code into a message a shop can act on, not a raw error code", async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: false,
        json: async () => ({ ok: false, error: "invalid_code" }),
      }),
    );

    const res = await accountLocal.workerJoin("shop@example.com", "000000", "Ade");
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/isn't right|expired/);
  });

  it("says so plainly when there is no connection at all", async () => {
    stubFetch(() => Promise.reject(new Error("network down")));
    const res = await accountLocal.workerJoin("shop@example.com", "123456", "Ade");
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/internet/i);
  });
});

describe("listWorkers and revokeWorker", () => {
  it("refuse with no session, rather than calling out", async () => {
    // Same reasoning as inviteStart above: no accessToken exists in this
    // environment, so both always take the "not signed in" path here.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const listRes = await accountLocal.listWorkers();
    expect(listRes.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();

    const revokeRes = await accountLocal.revokeWorker("worker-1");
    expect(revokeRes.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
