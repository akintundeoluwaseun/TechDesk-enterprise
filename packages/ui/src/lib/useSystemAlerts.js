import { useEffect } from "react";
import { platform } from "@techdesk/platform";
import { onArrived, arrivalAlerts, reminderAlerts, takeDue } from "@techdesk/core";
import { db } from "./db";
import { toast } from "./toast";

// How often reminders are CHECKED. Each one still repeats only every five hours;
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
 * Notifications are part of the app, not an option in it: this asks for
 * permission on its own, straight away. Some browsers (Safari, Firefox) only
 * let a page ask from inside a tap or click, so if the first ask could not
 * happen, the shop's first tap anywhere asks instead.
 */
function askForPermission() {
  const p = platform();
  if (!p.notifyPermission) return () => {};
  let done = false;
  const onTap = () => {
    if (done) return;
    done = true;
    window.removeEventListener("pointerdown", onTap, true);
    p.notifyPermission(true).catch(() => {});
  };
  p.notifyPermission(true)
    .then((state) => {
      if (state === "default" && !done) window.addEventListener("pointerdown", onTap, true);
    })
    .catch(() => {});
  return () => {
    done = true;
    window.removeEventListener("pointerdown", onTap, true);
  };
}

/**
 * The shop's system notifications: sales and jobs made on the shop's other
 * devices and branches as they sync in, and a reminder every five hours
 * about each customer who still owes money or has left finished work on the
 * shelf -- until they pay or collect.
 */
export function useSystemAlerts() {
  useEffect(() => {
    let cancelled = false;
    // A moment after start, so the ask lands on the app rather than a splash.
    let stopAsking = () => {};
    const ask = setTimeout(() => {
      stopAsking = askForPermission();
    }, 2500);

    const off = onArrived((items) => {
      show(takeDue(arrivalAlerts(items, db.getSettings()))).catch(() => {});
    });

    function checkReminders() {
      if (cancelled) return;
      const list = reminderAlerts(db.getSales(), db.getRepairs(), { settings: db.getSettings() });
      show(takeDue(list)).catch(() => {});
    }

    const first = setTimeout(checkReminders, FIRST_CHECK_MS);
    const every = setInterval(checkReminders, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      off();
      clearTimeout(ask);
      stopAsking();
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
}
