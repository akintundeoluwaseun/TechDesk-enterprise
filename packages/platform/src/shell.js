// Which shell is this running in?
//
// Capacitor injects window.Capacitor into the Android app; Electron's preload
// injects window.techdesk into the desktop app. A plain browser has neither,
// which is what dev, the web preview and the Web App all look like.
//
// These three questions used to be asked all over the app, and one of them was
// usually asked for the wrong reason: hq.js gated on IS_DESKTOP_APP when what
// it actually needed to know was whether there is a native side to call. That
// one is core's hasHostBridge() now. What is left here is genuinely about the
// shell -- how a file gets delivered.

export const IS_ANDROID_APP =
  typeof window !== "undefined" && !!window.Capacitor;

export const IS_DESKTOP_APP =
  typeof window !== "undefined" && !!window.techdesk;

/** @returns {"capacitor"|"electron"|"browser"} */
export function currentShell() {
  if (IS_ANDROID_APP) return "capacitor";
  if (IS_DESKTOP_APP) return "electron";
  return "browser";
}
