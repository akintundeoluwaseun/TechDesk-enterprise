import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { CHANGED_EVENT } from "./db";

// The scheduler that actually drives "syncing data" between two devices
// signed into the same account: pull, then push, on a heartbeat, right
// after a change, and the moment the browser comes back online. Nothing
// here talks to a real server -- account.status/pull/push are the seam.

const { status, pull, push, getPullCursor, setPullCursor, getPushCursor, setPushCursor } = vi.hoisted(() => ({
  status: vi.fn(),
  pull: vi.fn(),
  push: vi.fn(),
  getPullCursor: vi.fn(),
  setPullCursor: vi.fn(),
  getPushCursor: vi.fn(),
  setPushCursor: vi.fn(),
}));

vi.mock("./account", () => ({
  account: { status, pull, push },
  getPullCursor,
  setPullCursor,
  getPushCursor,
  setPushCursor,
}));

const { useAccountSync } = await import("./useAccountSync");

async function flush() {
  // Lets any already-resolved microtasks (the awaited mock promises) settle
  // before the test looks at what was called.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  status.mockReset().mockResolvedValue({ signedIn: true });
  pull.mockReset().mockResolvedValue({ ok: true, more: false, cursor: null });
  push.mockReset().mockResolvedValue({ ok: true, more: false, cursor: null });
  getPullCursor.mockReset().mockReturnValue(null);
  setPullCursor.mockReset();
  getPushCursor.mockReset().mockReturnValue(null);
  setPushCursor.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the account sync scheduler", () => {
  it("pulls then pushes on its own, a few seconds after mount", async () => {
    renderHook(() => useAccountSync());
    await vi.advanceTimersByTimeAsync(8000);
    await flush();

    expect(pull).toHaveBeenCalled();
    expect(push).toHaveBeenCalled();
  });

  it("does nothing when this device isn't signed in", async () => {
    status.mockResolvedValue({ signedIn: false });
    renderHook(() => useAccountSync());
    await vi.advanceTimersByTimeAsync(8000);
    await flush();

    expect(pull).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("does nothing while offline, without throwing", async () => {
    const spy = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderHook(() => useAccountSync());
    await vi.advanceTimersByTimeAsync(8000);
    await flush();

    expect(pull).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("keeps a multi-batch pull's cursor moving as each batch lands, not just at the end", async () => {
    pull
      .mockResolvedValueOnce({ ok: true, more: true, cursor: "c1" })
      .mockResolvedValueOnce({ ok: true, more: false, cursor: "c2" });

    renderHook(() => useAccountSync());
    await vi.advanceTimersByTimeAsync(8000);
    await flush();

    expect(pull).toHaveBeenCalledTimes(2);
    expect(pull).toHaveBeenNthCalledWith(2, "c1");
    expect(setPullCursor).toHaveBeenCalledWith("c1");
    expect(setPullCursor).toHaveBeenCalledWith("c2");
  });

  it("keeps an already-landed batch's progress when a later batch in the same run fails", async () => {
    // Exactly the bug this guards: a connection that drops mid-run must not
    // throw away a batch that already succeeded and was already applied.
    pull
      .mockResolvedValueOnce({ ok: true, more: true, cursor: "c1" })
      .mockResolvedValueOnce({ ok: false, error: "network" });

    renderHook(() => useAccountSync());
    await vi.advanceTimersByTimeAsync(8000);
    await flush();

    expect(setPullCursor).toHaveBeenCalledWith("c1");
    expect(setPullCursor).toHaveBeenCalledTimes(1);
    // The failed batch must not also stop the push half of this run.
    expect(push).toHaveBeenCalled();
  });

  it("runs again, debounced, after a change elsewhere in the app", async () => {
    renderHook(() => useAccountSync());
    await vi.advanceTimersByTimeAsync(8000);
    await flush();
    pull.mockClear();
    push.mockClear();

    window.dispatchEvent(new Event(CHANGED_EVENT));
    await vi.advanceTimersByTimeAsync(6000);
    await flush();

    expect(pull).toHaveBeenCalled();
  });

  it("runs immediately when the browser comes back online", async () => {
    renderHook(() => useAccountSync());
    await vi.advanceTimersByTimeAsync(8000);
    await flush();
    pull.mockClear();

    window.dispatchEvent(new Event("online"));
    await flush();

    expect(pull).toHaveBeenCalled();
  });
});
