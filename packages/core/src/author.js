// Who made this sale, and on which device.
//
// A sale or repair that arrives from another till is only worth a
// notification if it can say who: "Ade made a sale" is news, "a sale was
// made" is noise. So every new record is stamped with the name of whoever is
// signed in (a worker's own name, or the PIN user's) and this device's id.
// The device id is also how a device tells its own records apart from ones
// that came in through sync -- nobody needs a notification for the sale they
// just rang up themselves.

import { storage } from "./storage";

const KEY_DEVICE = "techdesk_device_id";
const KEY_NAME = "techdesk_author_name";

export function deviceId() {
  let id = storage.getItem(KEY_DEVICE);
  if (id) return id;
  id = globalThis.crypto?.randomUUID?.() ||
    `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  storage.setItem(KEY_DEVICE, id);
  return id;
}

/** Called by the app whenever someone signs in; null when nobody is. */
export function setAuthorName(name) {
  const clean = String(name || "").trim().slice(0, 60);
  if (clean) storage.setItem(KEY_NAME, clean);
  else storage.removeItem(KEY_NAME);
}

export function authorName() {
  return storage.getItem(KEY_NAME) || null;
}

/** The fields a new sale or repair carries. Anything already set wins. */
export function authorship(record) {
  return {
    byName: record?.byName ?? authorName(),
    byDevice: record?.byDevice ?? deviceId(),
  };
}
