// The clock behind the pending-payment reminder.
//
// A shop with sales or repairs still owed money gets reminded every three
// hours the app is open -- not on every launch, and not more than once per
// stretch of three hours, however many times the app is opened and closed
// in between. The "last reminded" timestamp is what makes that true: it is
// this device's own clock, checked forward only, the same rule the trial
// clock and the sync cursors already follow.

import { storage } from "./storage";

export const REMINDER_INTERVAL_MS = 3 * 60 * 60 * 1000; // three hours

const KEY_LAST_REMINDED = "techdesk_owed_reminder_last_at";

export function getLastRemindedAt() {
  return storage.getItem(KEY_LAST_REMINDED) || null;
}

export function setLastRemindedAt(iso) {
  storage.setItem(KEY_LAST_REMINDED, iso);
}

/**
 * Whether three hours have passed since the last reminder.
 *
 * Never reminded before reads as due -- a shop that already has money
 * outstanding the first time this ever runs should hear about it now, not
 * after an arbitrary wait with nothing to show for it. Anything unparsable
 * is treated the same way, so a corrupted value can't silently disable the
 * reminder forever.
 */
export function dueForReminder(lastRemindedAt, now = Date.now()) {
  if (!lastRemindedAt) return true;
  const last = new Date(lastRemindedAt).getTime();
  if (!Number.isFinite(last)) return true;
  return now - last >= REMINDER_INTERVAL_MS;
}
