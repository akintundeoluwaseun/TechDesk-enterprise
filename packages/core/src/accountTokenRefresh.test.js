import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

// Both restFetch (listWorkers, push, pull) and fnFetch-with-a-token
// (inviteStart) hit Supabase with whatever access token is in storage. That
// token expires (Supabase's default is an hour) long before anyone signs out
// on purpose, and until now nothing ever traded it in for a fresh one -- so
// a shop signed in since breakfast would start seeing "Invalid JWT" on
// everything by lunchtime, with no way out short of signing out and back in.
//
// This needs a real localStorage, not the "no accessToken ever exists in
// Node" shortcut the rest of this package's account tests lean on, so this
// file stubs one in.

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

function stubFetch(handler) {
  vi.stubGlobal("fetch", vi.fn(handler));
}

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeLocalStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function signedInAccountLocal(extraState = {}) {
  // A fresh module instance per test, so no session survives between them --
  // the stubbed localStorage above is what actually persists, and it too is
  // wiped every test by the fresh vi.stubGlobal in beforeEach.
  const { accountLocal } = await import("./accountLocal");
  localStorage.setItem(
    "techdesk_web_account",
    JSON.stringify({ email: "shop@example.com", accessToken: "stale-token", refreshToken: "good-refresh", ...extraState }),
  );
  return accountLocal;
}

describe("a stale access token refreshes itself instead of just failing", () => {
  it("retries a REST call once with a fresh token after a 401", async () => {
    const accountLocal = await signedInAccountLocal();
    const calls = [];
    stubFetch((url, init) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/auth/v1/token?grant_type=refresh_token")) {
        expect(JSON.parse(init.body)).toEqual({ refresh_token: "good-refresh" });
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: "fresh-token", refresh_token: "fresh-refresh" }),
        });
      }
      if (u.includes("/rest/v1/account_workers")) {
        const usedFreshToken = init.headers.Authorization === "Bearer fresh-token";
        if (!usedFreshToken) {
          return Promise.resolve({ ok: false, status: 401, json: async () => ({ message: "JWT expired" }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => [{ worker_user_id: "w1", name: "Ade", pages: ["sales"], created_at: "2026-01-01" }] });
      }
      throw new Error(`unexpected fetch: ${u}`);
    });

    const res = await accountLocal.listWorkers();

    expect(res.ok).toBe(true);
    expect(res.workers).toEqual([{ id: "w1", name: "Ade", pages: ["sales"], joinedAt: "2026-01-01" }]);
    expect(calls.filter((u) => u.includes("/rest/v1/account_workers"))).toHaveLength(2);
  });

  it("retries an edge-function call (inviteStart) once with a fresh token too", async () => {
    const accountLocal = await signedInAccountLocal();
    stubFetch((url, init) => {
      const u = String(url);
      if (u.includes("/auth/v1/token?grant_type=refresh_token")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: "fresh-token", refresh_token: "fresh-refresh" }),
        });
      }
      if (u.includes("/functions/v1/account-invite-start")) {
        const usedFreshToken = init.headers.Authorization === "Bearer fresh-token";
        if (!usedFreshToken) {
          return Promise.resolve({ ok: false, json: async () => ({ ok: false, message: "Invalid JWT" }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, code: "482913", expiresInMinutes: 15, pages: ["sales"] }) });
      }
      throw new Error(`unexpected fetch: ${u}`);
    });

    const res = await accountLocal.inviteStart(["sales"]);
    expect(res).toEqual({ ok: true, code: "482913", expiresInMinutes: 15, pages: ["sales"] });
  });

  it("keeps the rest of the session (role, businessId, pages) after refreshing", async () => {
    const accountLocal = await signedInAccountLocal({
      role: "worker",
      workerName: "Ade",
      businessId: "biz-1",
      pages: ["sales", "repairs"],
    });
    stubFetch((url) => {
      const u = String(url);
      if (u.includes("/auth/v1/token?grant_type=refresh_token")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: "fresh-token", refresh_token: "fresh-refresh" }),
        });
      }
      if (u.includes("/rest/v1/account_workers")) {
        return Promise.resolve({ ok: false, status: 401, json: async () => ({ message: "JWT expired" }) });
      }
      throw new Error(`unexpected fetch: ${u}`);
    });

    await accountLocal.listWorkers();
    const stored = JSON.parse(localStorage.getItem("techdesk_web_account"));
    expect(stored.accessToken).toBe("fresh-token");
    expect(stored.role).toBe("worker");
    expect(stored.workerName).toBe("Ade");
    expect(stored.businessId).toBe("biz-1");
    expect(stored.pages).toEqual(["sales", "repairs"]);
  });

  it("gives up after one failed refresh attempt, rather than looping", async () => {
    const accountLocal = await signedInAccountLocal();
    let refreshCalls = 0;
    stubFetch((url) => {
      const u = String(url);
      if (u.includes("/auth/v1/token?grant_type=refresh_token")) {
        refreshCalls += 1;
        return Promise.resolve({ ok: false, json: async () => ({ error_code: "invalid_grant" }) });
      }
      if (u.includes("/rest/v1/account_workers")) {
        return Promise.resolve({ ok: false, status: 401, json: async () => ({ message: "JWT expired" }) });
      }
      throw new Error(`unexpected fetch: ${u}`);
    });

    const res = await accountLocal.listWorkers();
    expect(res.ok).toBe(false);
    expect(refreshCalls).toBe(1);
  });

  it("never attempts a refresh for an ordinary, non-JWT failure", async () => {
    const accountLocal = await signedInAccountLocal();
    stubFetch((url) => {
      const u = String(url);
      if (u.includes("/rest/v1/account_workers")) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ message: "internal error" }) });
      }
      throw new Error(`unexpected fetch: ${u}`);
    });

    const res = await accountLocal.listWorkers();
    expect(res.ok).toBe(false);
    expect(res.message).toBe("internal error");
  });
});
