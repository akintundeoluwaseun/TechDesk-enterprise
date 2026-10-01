import { describe, it, expect, beforeEach } from "vitest";
import { resetStorage } from "./storage";
import { featureOn, saveAppControl, readAppControl, whenOn, pausedResult } from "./appControl";
import { account } from "./account";
import { checkout } from "./checkout";
import { hq } from "./hq";

describe("the console's app switches", () => {
  beforeEach(() => resetStorage());

  it("has every feature on before the console has ever answered", () => {
    expect(readAppControl()).toBe(null);
    for (const f of ["sync", "invites", "upgrade", "hq"]) expect(featureOn(f)).toBe(true);
  });

  it("turns off only what the console names as false", () => {
    saveAppControl({ features: { sync: true, invites: false } });
    expect(featureOn("sync")).toBe(true);
    expect(featureOn("invites")).toBe(false);
    expect(featureOn("upgrade")).toBe(true);
  });

  it("answers a paused action without calling it", async () => {
    let called = false;
    const act = whenOn("upgrade", async () => { called = true; return { ok: true }; });
    saveAppControl({ features: { upgrade: false } });
    const res = await act();
    expect(called).toBe(false);
    expect(res).toEqual(pausedResult("upgrade"));
    expect(res.message).toMatch(/paused/);
  });

  it("pauses sync, invites, upgrades and new head-office links at the real entry points", async () => {
    saveAppControl({ features: { sync: false, invites: false, upgrade: false, hq: false } });
    expect((await account.push(null)).paused).toBe(true);
    expect((await account.pull(null)).paused).toBe(true);
    expect((await account.inviteStart(["sales"])).paused).toBe(true);
    expect((await account.workerJoin("a@b.c", "123456", "Tunde")).paused).toBe(true);
    expect((await checkout.startOrder({ pin: "123456", tier: "business" })).paused).toBe(true);
    expect((await checkout.trialUnlock("123456", "business")).paused).toBe(true);
    expect((await hq.connectStart({ hqEmail: "x@y.z", branchName: "Ikeja" })).paused).toBe(true);
  });
});
