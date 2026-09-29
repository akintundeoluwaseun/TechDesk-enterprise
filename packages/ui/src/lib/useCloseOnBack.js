import { useEffect, useRef } from "react";

// A modal is a piece of UI state (useState), not a page -- opening one never
// touches the browser/WebView's own history, so there is nothing there for a
// back gesture to land on. On a phone that is the actual bug report: tap
// something that opens a sheet, swipe back once, and the whole app closes,
// because Android's default handling for the hardware/gesture back button is
// "go back in this page's history, or exit if there isn't any." A desktop
// window has no such gesture, so this is dormant there -- there's nothing to
// regress.
//
// The fix borrows the history entry a real page would have had: opening
// pushes one, so the very next back press finds it and closes this instead
// of falling through to the OS.
//
// popstate is a single window-wide event, not one scoped to whichever entry
// it moved past -- every overlay still mounted hears every back press, not
// only the innermost one. So when two are open (a tier's own screen inside
// ActivationModal, opened over the plan picker), a naive "a popstate arrived,
// so close me" would close BOTH on one press instead of unwinding them one at
// a time. openStack is the coordination for that: each open instance's own
// token, most-recently-opened last. On a popstate, only the instance whose
// token is on TOP treats it as its own; the rest see they're not the target
// and leave it alone. Listener registration order matches open order, so the
// top-of-stack check resolves to the right instance without the DOM's own
// history state (which carries no identity of its own -- every push looks
// the same) ever being consulted for it.
const openStack = [];

// isOpen covers both shapes this codebase uses: a modal that only exists
// while open (pass `true` -- the component's own mount is the signal) and a
// panel inside an always-mounted shell like MobileAppBar's drawer (pass the
// boolean that toggles it).
export function useCloseOnBack(isOpen, onClose) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;

    const token = {};
    let consumedByBack = false;
    // What was here before this pushed its own entry, so a non-back close
    // can restore it exactly -- see the cleanup below.
    const before = { state: window.history.state, url: window.location.href };
    openStack.push(token);
    window.history.pushState({ techdeskOverlay: true }, "");

    function onPopState() {
      if (openStack[openStack.length - 1] !== token) return;
      openStack.pop();
      consumedByBack = true;
      onCloseRef.current();
    }
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      if (consumedByBack) return;

      // Closed some other way -- a Close button, Escape, a save that
      // dismisses itself. Take this token off the stack (wherever it ended
      // up -- it's still the top in the ordinary case, but not necessarily
      // once something unusual has happened) so a later popstate doesn't
      // mistake a DIFFERENT, still-open instance for this one.
      const at = openStack.lastIndexOf(token);
      if (at !== -1) openStack.splice(at, 1);

      // And erase its history entry, or the next back press lands on a dead
      // one instead of the screen actually behind this. This restores the
      // entry in place with replaceState rather than navigating with
      // back(): back() is asynchronous, and an earlier version of this hook
      // called it here, which meant its own popstate could still be in
      // flight when React (in Strict Mode, which mounts, cleans up, and
      // re-mounts every effect once as a matter of course) had already
      // mounted a whole new instance -- that instance's listener had no way
      // to tell a stray self-triggered popstate apart from a real back
      // press, and the modal closed itself on open. replaceState has no
      // such round trip: it edits this history entry in place, synchronously,
      // with no popstate at all.
      //
      // Only when it's still the current entry, though: a menu item that
      // both closes this AND navigates (MobileAppBar's drawer links)
      // already pushed the new route's own entry on top of ours before this
      // cleanup gets to run -- effects fire after the click handler that
      // called navigate(), not inside it -- and overwriting the current
      // entry then would erase that navigation's own entry instead of ours.
      if (window.history.state?.techdeskOverlay) {
        window.history.replaceState(before.state, "", before.url);
      }
    };
  }, [isOpen]);
}
