import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCloseOnBack } from "./useCloseOnBack";

// jsdom's history actually navigates -- pushState/back/forward move a real
// session-history list and back() dispatches a real popstate, which is
// exactly the browser behavior this hook depends on. No mocking needed. The
// dispatch lands on a later task, and not always the very next one, so every
// assertion that follows a back() waits for it rather than assuming one tick
// is enough.

beforeEach(() => {
  // Each test should start from a clean, single-entry history, not wherever
  // the previous test left the stack.
  window.history.replaceState(null, "");
});

describe("a phone's back gesture, against something that is only local state", () => {
  it("closes it instead of falling through to the OS and exiting the app", async () => {
    const onClose = vi.fn();
    renderHook(() => useCloseOnBack(true, onClose));
    await waitFor(() => expect(window.history.state?.techdeskOverlay).toBe(true));

    window.history.back();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("does nothing while closed -- there is no entry to intercept a back press with", () => {
    const onClose = vi.fn();
    const startLength = window.history.length;
    renderHook(() => useCloseOnBack(false, onClose));

    expect(window.history.length).toBe(startLength);
  });

  it("cleans up its own entry when closed by a button instead of a back press", async () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(({ open }) => useCloseOnBack(open, onClose), {
      initialProps: { open: true },
    });
    await waitFor(() => expect(window.history.state?.techdeskOverlay).toBe(true));

    rerender({ open: false });
    await waitFor(() => expect(window.history.state?.techdeskOverlay).toBeFalsy());

    // The entry is gone, so a later back press has nothing of ours left to
    // find -- it must not call onClose for a screen already closed by the
    // time it arrives.
    window.history.back();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("unwinds two nested overlays one at a time, innermost first", async () => {
    const closeOuter = vi.fn();
    const closeInner = vi.fn();
    renderHook(() => {
      useCloseOnBack(true, closeOuter);
      useCloseOnBack(true, closeInner);
    });
    await waitFor(() => expect(window.history.state?.techdeskOverlay).toBe(true));

    window.history.back();
    await waitFor(() => expect(closeInner).toHaveBeenCalledTimes(1));
    expect(closeOuter).not.toHaveBeenCalled();

    window.history.back();
    await waitFor(() => expect(closeOuter).toHaveBeenCalledTimes(1));
  });

  it("survives Strict Mode's mount-cleanup-remount rehearsal without closing itself or losing later back presses", async () => {
    // Strict Mode (dev only) mounts every effect, tears it down, and mounts
    // it again, synchronously, to catch exactly this kind of bug. An earlier
    // version of this hook called history.back() from that first, rehearsal
    // cleanup to erase its own entry -- back() is asynchronous, so by the
    // time its popstate actually landed, the SECOND (real) mount already had
    // its own listener attached with no way to tell a stray, self-inflicted
    // popstate apart from a genuine back press: the modal closed itself the
    // instant it opened. A counter to tell the two apart was tried next and
    // also failed, more subtly -- it could be left permanently over-primed by
    // one overlay's rehearsal, silently swallowing a real back press on a
    // LATER, unrelated overlay. The actual fix (replaceState, which is
    // synchronous and never fires popstate) needs neither, so this is really
    // two assertions in one: the rehearsal must not self-close, and it must
    // not poison anything a real back press still needs to work.
    const onClose = vi.fn();
    renderHook(() => useCloseOnBack(true, onClose), { wrapper: React.StrictMode });
    await waitFor(() => expect(window.history.state?.techdeskOverlay).toBe(true));

    expect(onClose).not.toHaveBeenCalled();

    window.history.back();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("never undoes a navigation that happened to close it, even though that also looked like 'closed by something other than back'", async () => {
    // MobileAppBar's drawer: tapping a link both closes the drawer and
    // navigates. The navigation's own pushState lands on top of this
    // overlay's entry before this hook's cleanup runs -- calling back()
    // there would reverse the very navigation the tap asked for.
    const onClose = vi.fn();
    const { rerender } = renderHook(({ open }) => useCloseOnBack(open, onClose), {
      initialProps: { open: true },
    });
    await waitFor(() => expect(window.history.state?.techdeskOverlay).toBe(true));

    window.history.pushState({ somewhereElse: true }, "");
    rerender({ open: false });

    // Nothing was popped -- the entry this hook pushed is still down in the
    // stack, just no longer the current one, and that's left alone rather
    // than reversed back off.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(window.history.state?.somewhereElse).toBe(true);
  });
});
