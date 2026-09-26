import { useEffect } from "react";
import { db } from "./db";
import { money } from "./currency";
import {
  pendingPaymentsSummary, getLastRemindedAt, setLastRemindedAt, dueForReminder,
} from "@techdesk/core";

// How often this CHECKS whether three hours have actually passed --
// shorter than the reminder interval itself, so a reminder that comes due
// mid-afternoon fires close to on time rather than only at whatever moment
// the app next happens to run this.
const CHECK_EVERY_MS = 15 * 60 * 1000;

/**
 * Reminds the shop, roughly every three hours the app is open, of any sale
 * or repair still owed money. The in-app bell already carries the same
 * figure permanently (see notifications.js's "owed" item) -- this is the
 * version that reaches somebody not looking at the screen, as a real OS
 * notification, wherever the shell and the permission state allow one.
 *
 * Never asks for notification permission out of nowhere: it is requested
 * only the first time there is something real to report, so a shop that
 * never has an unpaid sale is never asked at all. A shop that says no is
 * never asked again by this -- the bell still carries the figure either way.
 */
export function useOwedReminder() {
  useEffect(() => {
    function notify(count, total) {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      const body = `${count} payment${count === 1 ? "" : "s"} still pending — ${money(total, db.getSettings())} owed.`;
      const show = () => {
        try {
          // eslint-disable-next-line no-new
          new Notification("Pending payments", { body, tag: "owed-reminder" });
        } catch {
          // Some shells advertise the constructor and still refuse it (a
          // WebView, an origin without the right permission model). The
          // bell already carries this figure, so losing the popup here
          // costs nothing worth throwing over.
        }
      };

      if (Notification.permission === "granted") {
        show();
      } else if (Notification.permission === "default") {
        Notification.requestPermission()
          .then((perm) => {
            if (perm === "granted") show();
          })
          .catch(() => {
            // Denied, dismissed, or not actually supported -- silence is
            // the correct response to all three.
          });
      }
    }

    function check() {
      if (!dueForReminder(getLastRemindedAt())) return;
      const { count, total } = pendingPaymentsSummary(db.getSales(), db.getRepairs());
      if (count === 0) return;
      // Moved before the notification is shown, not after: a permission
      // prompt a shop takes ten minutes to answer must not leave the clock
      // re-checking (and re-asking) every fifteen in the meantime.
      setLastRemindedAt(new Date().toISOString());
      notify(count, total);
    }

    check();
    const interval = setInterval(check, CHECK_EVERY_MS);
    return () => clearInterval(interval);
  }, []);
}
