// Android's back button and back gesture, answered properly.
//
// Capacitor's default, when nothing claims the back button, is the WebView's
// own: go back in this page's history, and if there is none, close the app.
// That is right for a web page and wrong for a shop. Two ways it bit:
//
//   - Tap back to put something away -- the assistant, a sheet -- and the
//     whole app closed, mid-sale. Overlays now push a history entry of their
//     own (see ui/lib/useCloseOnBack), so there IS something to go back to
//     and this hands it straight to the WebView. That half is fixed there;
//     this file is what stops the other half.
//
//   - Tap back once too often on the first screen and the app is gone. No
//     warning, no second chance. A till that closes on one stray swipe is a
//     till the shop stops trusting, and an accidental exit in the middle of
//     ringing somebody up costs the sale in progress.
//
// So: go back while there is anywhere to go, and on the last screen ask once
// before closing. The second press has to come within a couple of seconds,
// which is short enough that it can only be deliberate -- a shop that meant
// to leave presses twice without thinking about it, and one that did not
// simply carries on and never sees it again.
import { App } from "@capacitor/app";
import { toast } from "@techdesk/ui/toast";

// How long "again" lasts. Long enough to read the line and press again,
// short enough that a stray press minutes later is not taken as the answer.
const AGAIN_MS = 2000;

export function wireBackButton() {
  let armed = false;
  let timer = null;

  App.addListener("backButton", ({ canGoBack }) => {
    // Anywhere to go back to -- an open overlay's entry, or the screen before
    // this one -- and this is an ordinary back. The WebView does the work and
    // whatever pushed that entry decides what it means.
    if (canGoBack) {
      window.history.back();
      return;
    }

    if (armed) {
      clearTimeout(timer);
      App.exitApp();
      return;
    }

    armed = true;
    toast({ title: "Press back again to close TechDesk", tone: "info" }, AGAIN_MS);
    timer = setTimeout(() => {
      armed = false;
    }, AGAIN_MS);
  });
}
