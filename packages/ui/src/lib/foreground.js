/**
 * Runs something whenever the app comes back to the front.
 *
 * The checks that keep an installed app in step with us -- announcements,
 * the console's switches, and whether there is a newer version -- used to
 * listen for the window's "focus" event alone. That is fine in a browser
 * tab, and useless in the Android app: a Capacitor WebView does not fire
 * "focus" when the phone returns to TechDesk, and its timers are suspended
 * while the app sits in the background. So after the first launch the phone
 * stopped asking, and prices, notices and new-version news only ever arrived
 * on a cold start.
 *
 * "visibilitychange" does fire in a WebView on resume, so both are wired up
 * here, in one place, for every one of those checks.
 */
export function onAppForeground(run) {
  if (typeof window === "undefined") return () => {};
  const onVisible = () => {
    if (typeof document === "undefined" || document.visibilityState !== "hidden") run();
  };
  window.addEventListener("focus", run);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener("focus", run);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
