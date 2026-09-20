import { describe, it, expect, afterEach, vi } from "vitest";
import { setHostBridge, hasHostBridge } from "./bridge";
import { hq, hqBridge, hqLocal } from "./hq";

afterEach(() => setHostBridge(null));

describe("head office reaches every shell", () => {
  it("is available with no native host at all", () => {
    // The bug being fixed. The old client asked IS_DESKTOP_APP and answered
    // "no" by refusing with not_desktop -- which is why the Android app had
    // no head office: not a missing feature, a feature that said no to
    // everyone who tried it.
    expect(hasHostBridge()).toBe(false);
    expect(hq.available()).toBe(true);
  });

  it("asks the native host when there is one", async () => {
    const hqRead = vi.fn(async () => ({ ok: true, state: { connected: true, installId: "i1" } }));
    setHostBridge({ hqRead });
    const state = await hq.status();
    expect(hqRead).toHaveBeenCalled();
    expect(state.connected).toBe(true);
  });

  it("does not ask it when there is none, and still answers", async () => {
    // No bridge: the in-page client reads its own store rather than throwing
    // or reporting the shop disconnected when it is simply on a phone.
    const state = await hq.status();
    expect(state).toBeTruthy();
    expect(state.connected).toBe(false);
  });

  it("follows the host appearing and disappearing, with no reload", async () => {
    const hqRead = vi.fn(async () => ({ ok: true, state: { connected: true } }));
    setHostBridge({ hqRead });
    await hq.status();
    expect(hqRead).toHaveBeenCalledTimes(1);

    setHostBridge(null);
    await hq.status();
    expect(hqRead).toHaveBeenCalledTimes(1); // not consulted any more
  });

  it("offers the same methods either way", () => {
    // A shell quietly missing connectVerify would look to a shop exactly like
    // a code that never works, which is indistinguishable from a wrong code.
    for (const m of ["status", "connectStart", "connectVerify", "sync", "disconnect"]) {
      expect(typeof hqBridge[m], `hqBridge.${m}`).toBe("function");
      expect(typeof hqLocal[m], `hqLocal.${m}`).toBe("function");
      expect(typeof hq[m], `hq.${m}`).toBe("function");
    }
  });
});
