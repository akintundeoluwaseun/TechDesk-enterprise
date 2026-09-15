// Which shell is this running in?
//
// Capacitor injects window.Capacitor into the Android app; Electron's preload
// injects window.techdesk into the desktop app. A plain browser has neither,
// which is what dev and the web preview look like.
export const IS_ANDROID_APP =
  typeof window !== "undefined" && !!window.Capacitor;

export const IS_DESKTOP_APP =
  typeof window !== "undefined" && !!window.techdesk;
