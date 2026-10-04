// What the owner's console says about the app as a whole (migration 0037's
// app_control): must this version update, is there a maintenance notice,
// and which features are switched on.
//
// The answer is kept on the device, so the switches still hold offline and
// on the next launch. A device that has never heard back has every feature
// ON -- a switch that has never been read must not turn anything off.
import { storage } from "./storage";

const KEY = "techdesk_app_control";

export const FEATURES = ["sync", "invites", "upgrade", "hq", "ai"];

const PAUSED = {
  sync: "Sync is paused for a short while. Everything you do is saved on this device and syncs when it's back.",
  invites: "Adding workers is paused for a short while. Please try again later.",
  upgrade: "Upgrades are paused for a short while. Please try again later.",
  hq: "Connecting to a head office is paused for a short while. Please try again later.",
  ai: "Voice orders are paused for a short while. Please use the buttons for now.",
};

export function readAppControl() {
  try {
    const raw = storage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export function saveAppControl(control) {
  if (control && typeof control === "object") storage.setItem(KEY, JSON.stringify(control));
}

/** On unless the console has said, in so many words, that it is off. */
export function featureOn(name) {
  const f = readAppControl()?.features;
  return !f || f[name] !== false;
}

/** What a paused feature answers instead of doing anything. */
export function pausedResult(name) {
  return { ok: false, error: "paused", paused: true, reason: "paused", message: PAUSED[name] };
}

/** Wraps an async action so it answers pausedResult() while its feature is off. */
export function whenOn(name, fn) {
  return (...args) => (featureOn(name) ? fn(...args) : Promise.resolve(pausedResult(name)));
}
