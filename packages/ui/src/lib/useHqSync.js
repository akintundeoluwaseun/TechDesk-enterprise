import { useEffect } from "react";
import { CHANGED_EVENT } from "./db";
import { runSync, refreshSyncState } from "./syncEngine";

// How often a connected device reports in even when nothing has happened.
// It is a heartbeat, not the main mechanism: a sale goes up seconds after it
// is rung, not up to two minutes later.
const HEARTBEAT_MS = 2 * 60 * 1000;

// Long enough that ringing up a sale -- several writes in a row -- is one
// push rather than six, short enough that head office sees it while the
// customer is still at the counter.
const AFTER_CHANGE_MS = 6 * 1000;

/**
 * Keeps head office and the rest of the shop up to date in the background.
 *
 * Four things start a run: a change to this shop's own records, the app
 * becoming visible again, the network coming back, and a timer that carries
 * on regardless. The timer alone was enough to be correct and not enough to
 * feel right -- a shop that made a sale and then looked at head office saw
 * nothing there, and had no way to tell whether it was broken or just early.
 *
 * It runs on EVERY shell. It used to bail unless this was the Electron build,
 * on the grounds that the token lives in the main process there. It does --
 * and the browser and Android builds keep theirs in their own storage and
 * post for themselves. So a connected phone synced only while someone sat on
 * the Connect screen with a thumb on the button, and a shop that used the
 * phone app all day sent nothing at all.
 *
 * Nothing here surfaces errors. A shop with no internet is the normal case,
 * and the next run picks up exactly where this one left off, because neither
 * cursor moves except on a confirmed success.
 */
export function useHqSync() {
  useEffect(() => {
    let cancelled = false;
    let heartbeat = null;
    let debounce = null;

    const push = () => {
      if (cancelled) return;
      runSync();
    };

    function soon() {
      clearTimeout(debounce);
      debounce = setTimeout(push, AFTER_CHANGE_MS);
    }

    function onVisible() {
      if (document.visibilityState === "visible") push();
    }

    // What is waiting, before anything is sent: the menu should be able to
    // say "3 waiting" on a shop that has been offline since yesterday,
    // without waiting for a sync to fail first.
    refreshSyncState();

    window.addEventListener(CHANGED_EVENT, soon);
    window.addEventListener("online", push);
    document.addEventListener("visibilitychange", onVisible);

    // A few seconds after launch, so it never competes with first paint.
    const firstRun = setTimeout(push, 8000);
    heartbeat = setInterval(push, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearTimeout(firstRun);
      clearTimeout(debounce);
      clearInterval(heartbeat);
      window.removeEventListener(CHANGED_EVENT, soon);
      window.removeEventListener("online", push);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
