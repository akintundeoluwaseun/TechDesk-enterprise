import { useEffect } from "react";
import { account, getPushCursor, setPushCursor, getPullCursor, setPullCursor } from "./account";
import { CHANGED_EVENT } from "./db";

// Same cadence as useHqSync, for the same reason: a heartbeat that is
// correct but not felt is not enough. A shop that makes a sale and checks
// another device a few seconds later should find it there.
const HEARTBEAT_MS = 2 * 60 * 1000;
const AFTER_CHANGE_MS = 6 * 1000;

/**
 * Keeps a signed-in account's devices in sync with each other, in the
 * background, for as long as this device is signed in.
 *
 * Unlike useHqSync (push-only -- a branch only ever reports UP to head
 * office), this goes both ways: pull first, so this device catches up on
 * what the others have done, then push, so they catch up on this one. Order
 * only matters for latency, not correctness -- db.applyIncoming is
 * last-write-wins regardless of which half runs first.
 *
 * Nothing here surfaces errors. No internet, or not signed in at all, is the
 * normal case, not a fault -- the next run picks up exactly where this one
 * left off, because a cursor only moves on a confirmed success.
 */
export function useAccountSync() {
  useEffect(() => {
    let cancelled = false;
    let heartbeat = null;
    let debounce = null;
    let running = false;

    async function runOnce() {
      if (cancelled || running) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;

      const status = await account.status();
      if (!status?.signedIn) return;

      running = true;
      try {
        let guard = 0;
        let pulled = await account.pull(getPullCursor());
        while (!cancelled && pulled?.ok && pulled.more && guard < 20) {
          guard += 1;
          pulled = await account.pull(pulled.cursor);
        }
        if (pulled?.ok && pulled.cursor) setPullCursor(pulled.cursor);

        guard = 0;
        let pushed = await account.push(getPushCursor());
        while (!cancelled && pushed?.ok && pushed.more && guard < 20) {
          guard += 1;
          pushed = await account.push(pushed.cursor);
        }
        if (pushed?.ok && pushed.cursor) setPushCursor(pushed.cursor);
      } catch {
        // Never let a sync failure bubble into the UI.
      } finally {
        running = false;
      }
    }

    function soon() {
      clearTimeout(debounce);
      debounce = setTimeout(runOnce, AFTER_CHANGE_MS);
    }

    function onVisible() {
      if (document.visibilityState === "visible") runOnce();
    }

    window.addEventListener(CHANGED_EVENT, soon);
    window.addEventListener("online", runOnce);
    document.addEventListener("visibilitychange", onVisible);

    const firstRun = setTimeout(runOnce, 8000);
    heartbeat = setInterval(runOnce, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearTimeout(firstRun);
      clearTimeout(debounce);
      clearInterval(heartbeat);
      window.removeEventListener(CHANGED_EVENT, soon);
      window.removeEventListener("online", runOnce);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
