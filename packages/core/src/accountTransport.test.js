import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { setHostBridge, hasHostBridge } from "./bridge";
import { storage } from "./storage";
import {
  account, accountBridge, accountLocal,
  getPushCursor, setPushCursor, getPullCursor, setPullCursor,
  getAccountGateDecision, setAccountGateDecision,
} from "./account";

afterEach(() => setHostBridge(null));
beforeEach(() => storage.clear());

describe("the shop's own cloud account reaches every shell", () => {
  it("is available with no native host at all", () => {
    expect(hasHostBridge()).toBe(false);
    expect(account.available()).toBe(true);
  });

  it("asks the native host when there is one", async () => {
    const accountRead = vi.fn(async () => ({ ok: true, state: { signedIn: true, email: "shop@example.com" } }));
    setHostBridge({ accountRead });
    const state = await account.status();
    expect(accountRead).toHaveBeenCalled();
    expect(state.signedIn).toBe(true);
    expect(state.email).toBe("shop@example.com");
  });

  it("does not ask it when there is none, and still answers", async () => {
    // Same bug hq.js was fixed for: refusing outright on a shell with no
    // native side is not "not supported", it is a feature that never existed
    // on a phone.
    const state = await account.status();
    expect(state).toBeTruthy();
    expect(state.signedIn).toBe(false);
  });

  it("refuses signUp/signIn on the bridge path with no host, rather than throwing", async () => {
    const res1 = await accountBridge.signUp("a@b.com", "password1");
    expect(res1.ok).toBe(false);
    const res2 = await accountBridge.signIn("a@b.com", "password1");
    expect(res2.ok).toBe(false);
  });
});

describe("push/pull cursors and the gate decision", () => {
  it("start unset", () => {
    expect(getPushCursor()).toBeNull();
    expect(getPullCursor()).toBeNull();
    expect(getAccountGateDecision()).toBeNull();
  });

  it("remember what was set", () => {
    setPushCursor("2026-01-01T00:00:00.000Z");
    setPullCursor("2026-01-02T00:00:00.000Z");
    setAccountGateDecision("signed_in");
    expect(getPushCursor()).toBe("2026-01-01T00:00:00.000Z");
    expect(getPullCursor()).toBe("2026-01-02T00:00:00.000Z");
    expect(getAccountGateDecision()).toBe("signed_in");
  });

  it("a falsy cursor is never stored over a real one", () => {
    setPushCursor("2026-01-01T00:00:00.000Z");
    setPushCursor(null);
    expect(getPushCursor()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("signing out clears both cursors so a different account never inherits them", async () => {
    setPushCursor("2026-01-01T00:00:00.000Z");
    setPullCursor("2026-01-02T00:00:00.000Z");
    await account.signOut();
    expect(getPushCursor()).toBeNull();
    expect(getPullCursor()).toBeNull();
  });
});

describe("accountLocal push/pull", () => {
  it("sends nothing and reports nothing waiting when there is no local data", async () => {
    const res = await accountLocal.push(null);
    expect(res.ok).toBe(true);
    expect(res.sent).toBe(0);
    expect(res.more).toBe(false);
  });

  it("reports not_signed_in rather than posting with no session", async () => {
    // No accessToken has ever been saved in this environment (no
    // localStorage under node), so a push with real records refuses cleanly
    // rather than sending a request with no Authorization.
    const { db } = await import("./db");
    db.createSale({ items: [{ id: "i1", name: "x", qty: 1, price: 100 }], total: 100 });
    const res = await accountLocal.push(null);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("not_signed_in");
    expect(res.sent).toBe(0);
  });
});
