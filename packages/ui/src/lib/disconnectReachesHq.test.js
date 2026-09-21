import { describe, it, expect, beforeEach, vi } from "vitest";
import { hqLocal } from "@techdesk/core";
import { rememberRevoke, pendingRevoke, clearRevoke } from "@techdesk/core";

// Disconnecting has to reach the server.
//
// It did not. The app dropped its token and stopped there, so devices.status
// stayed 'active' and Monitor went on listing a phone the shop had
// deliberately disconnected -- and nothing on the screen said otherwise.
//
// The awkward half is the shop with no signal, which is most of them, and
// which is exactly when a device gets handed on. Disconnecting must not wait
// for the internet, and the server must still be told eventually.

const STATE = "techdesk_web_hq";

function connected() {
  localStorage.setItem(STATE, JSON.stringify({ token: "devtok-1", businessId: "b1", branchName: "Counter" }));
}

describe("disconnecting", () => {
  beforeEach(() => {
    localStorage.clear();
    clearRevoke();
    vi.restoreAllMocks();
  });

  it("tells the server, then forgets the connection here", async () => {
    connected();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, result: "revoked" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await hqLocal.disconnect();

    const called = fetchMock.mock.calls[0];
    expect(called[0]).toContain("/functions/v1/connect-disconnect");
    expect(JSON.parse(called[1].body)).toMatchObject({ token: "devtok-1" });
    expect(res.told).toBe(true);
    expect(localStorage.getItem(STATE)).toBe(null);
    // Nothing owed: the server already knows.
    expect(pendingRevoke()).toBe(null);
  });

  it("still disconnects with no internet, and keeps the errand", async () => {
    connected();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const res = await hqLocal.disconnect();

    // The half the shop asked for happened regardless.
    expect(localStorage.getItem(STATE)).toBe(null);
    expect((await hqLocal.status()).connected).toBe(false);
    // And it is honest about the half that did not.
    expect(res.told).toBe(false);
    expect(pendingRevoke()?.token).toBe("devtok-1");
  });

  it("hands the disconnect back when the network returns", async () => {
    rememberRevoke("devtok-1");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ ok: true, result: "revoked" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await hqLocal.flushRevoke();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(res).toMatchObject({ ok: true, pending: false, told: true });
    expect(pendingRevoke()).toBe(null);
  });

  it("keeps trying until it lands, rather than dropping it", async () => {
    rememberRevoke("devtok-1");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    expect(await hqLocal.flushRevoke()).toMatchObject({ ok: false, pending: true });
    expect(pendingRevoke()?.token).toBe("devtok-1");
  });

  it("gives up on a token nobody has managed to hand back in a month", async () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem("techdesk_web_hq_revoke", JSON.stringify({ token: "devtok-1", at: old }));
    // A dead credential sitting in storage forever serves nobody.
    expect(pendingRevoke()).toBe(null);
    expect(localStorage.getItem("techdesk_web_hq_revoke")).toBe(null);
  });

  it("asks for nothing when there was no connection to drop", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await hqLocal.disconnect();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pendingRevoke()).toBe(null);
  });
});
