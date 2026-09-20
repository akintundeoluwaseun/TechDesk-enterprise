// "The shop's records changed." One announcement, from one place.
//
// Every mutation in db.js goes through write(), so this fires for all of them;
// a per-method notification would miss whichever method got added last. That
// is not hypothetical -- it is why the web app could sit connected to HQ and
// deliver nothing.
//
// Core does not reach for `window`. The host decides what an announcement
// means: the desktop and web apps re-dispatch it as a DOM CustomEvent so the
// existing listeners keep working, and a test can just collect the keys.

export const CHANGED_EVENT = "techdesk:changed";

let sink = null;

export function setChangeSink(fn) {
  sink = typeof fn === "function" ? fn : null;
}

export function emitChanged(key) {
  if (!sink) return;
  try {
    sink(key);
  } catch {
    // A listener that throws must not roll back a write that already
    // succeeded. The record is saved; the notification is the optional part.
  }
}
