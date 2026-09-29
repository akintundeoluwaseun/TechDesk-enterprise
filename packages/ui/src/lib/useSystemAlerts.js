import { useEffect } from "react";
import { platform } from "@techdesk/platform";
import {
  onArrived, arrivalAlerts, reminderAlerts, takeDue, alertPrefs,
} from "@techdesk/core";
import { db } from "./db";
import { toast } from "./toast";

// How often reminders are CHECKED. Each one still shows at most once a day;
// this only decides how soon after coming due it goes out.
const CHECK_EVERY_MS = 20 * 60 * 1000;
// Long enough after start that the first sync has landed and the shop is
// looking at the app, not a splash screen.
const FIRST_CHECK_MS = 15 * 1000;

async function show(alerts) {
  if (!alerts.length) return;
  const p = platform();
  for (const a of alerts) {
    // The system notification is for someone not looking at the screen; the
    // toast is for someone who is. Both, because we cannot tell which.
    const shown = p.notify ? await p.notify({ title: a.title, body: a.body, tag: a.id }).catch(() => false) : false;
    if (!shown || (typeof document !== "undefined" && document.visibilityState === "visible")) {
      toast({ title: a.title, message: a.body, tone: a.kind === "arrival" ? "success" : "info" });
    }
  }
}

/**
 * The shop's system notifications: sales and jobs made on the shop's other
 * devices and branches as they sync in, and a daily nudge about customers
 * who owe money or have left finished work on the shelf.
 */
export function useSystemAlerts() {
  useEffect(() => {
    let cancelled = false;

    const off = onArrived((items) => {
      const prefs = alertPrefs();
      if (!prefs.enabled || !prefs.arrivals) return;
      show(takeDue(arrivalAlerts(items, db.getSettings()))).catch(() => {});
    });

    function checkReminders() {
      if (cancelled) return;
      const prefs = alertPrefs();
      if (!prefs.enabled) return;
      const list = reminderAlerts(db.getSales(), db.getRepairs(), { prefs, settings: db.getSettings() });
      show(takeDue(list)).catch(() => {});
    }

    const first = setTimeout(checkReminders, FIRST_CHECK_MS);
    const every = setInterval(checkReminders, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      off();
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
}
