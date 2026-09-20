// The host's native side, when it has one.
//
// Electron's preload exposes it on window.techdesk: reading and writing the
// HQ connection, the install id, LAN activity. Core never reaches for that
// global -- the host hands it over at startup, so the same code runs in a
// browser tab that has no native side at all.
//
// "No bridge" is a normal state, not a broken one. It is what the Web App and
// every test are, and the callers check hasHostBridge() rather than asking
// which platform they are on. That question was IS_DESKTOP_APP, and it was
// always really this one.

let bridge = null;

export function setHostBridge(impl) {
  bridge = impl || null;
}

export function hostBridge() {
  return bridge;
}

export function hasHostBridge() {
  return bridge !== null;
}
