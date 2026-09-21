// Telling an owner that something happened, without a push server.
//
// Monitor already asks HQ for a summary every minute, and that summary
// carries the activity feed -- a sale, a repair, with an id and a message.
// So the phone has everything it needs to raise a notification itself; what
// was missing was anything that did.
//
// THIS IS NOT PUSH, AND THE DIFFERENCE MATTERS. A real push notification
// arrives from a server whether or not the app is running. These are local
// notifications: the app raises them off its own refresh, so they arrive
// while Android is still letting Monitor poll -- open, recently open, or
// alive in the background. With the phone idle overnight and the app closed
// for hours, Android stops the polling and nothing arrives until the owner
// opens it again.
//
// The alternative is Firebase, which means a Google project, a
// google-services.json, and a server that holds device tokens. That is worth
// doing later. This is worth having now, needs nothing set up, and covers
// the case it is actually for: an owner with the app on their phone during
// the working day.
import { Preferences } from "@capacitor/preferences";

const SEEN_KEY = "techdesk_monitor_seen_activity";
const PREF_KEY = "techdesk_monitor_notify";
const SEEN_MAX = 200;   // ids kept, so the list cannot grow forever

// The same boxing trick session.js needs: a Capacitor plugin is a Proxy, and
// returning one from an async function makes JavaScript call .then() on it,
// which never settles.
let box = null;
async function plugin() {
  if (box) return box;
  try {
    const mod = await import("@capacitor/local-notifications");
    box = { api: mod.LocalNotifications ?? null };
  } catch {
    box = { api: null };   // a browser, or a build without the plugin
  }
  return box;
}

async function read(key, fallback) {
  try {
    const { value } = await Preferences.get({ key });
    return value ? JSON.parse(value) : fallback;
  } catch {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
}

async function write(key, value) {
  const raw = JSON.stringify(value);
  try {
    await Preferences.set({ key, value: raw });
  } catch {
    try { localStorage.setItem(key, raw); } catch { /* best effort */ }
  }
}

/** Has the owner turned these off? Default on -- it is why Monitor exists. */
export async function notificationsEnabled() {
  return (await read(PREF_KEY, true)) !== false;
}

export async function setNotificationsEnabled(on) {
  await write(PREF_KEY, !!on);
}

/** Ask once. Android 13 and newer refuse to show anything without this. */
export async function requestPermission() {
  const { api } = await plugin();
  if (!api) return false;
  try {
    const current = await api.checkPermissions();
    if (current.display === "granted") return true;
    const asked = await api.requestPermissions();
    return asked.display === "granted";
  } catch {
    return false;
  }
}

// What is worth interrupting someone for. A customer record being edited is
// not; money arriving and a repair moving are.
const WORTH_IT = new Set(["sale", "repair"]);

/**
 * Raise a notification for anything in the feed this phone has not seen.
 *
 * The first run after signing in records what is already there WITHOUT
 * notifying: otherwise an owner opening Monitor for the first time gets
 * twenty notifications for sales they already know about.
 */
export async function notifyNewActivity(activity) {
  const items = Array.isArray(activity) ? activity : [];
  if (!items.length) return 0;

  const seen = await read(SEEN_KEY, null);
  const ids = items.map((a) => a.id).filter(Boolean);

  if (seen === null) {
    await write(SEEN_KEY, ids.slice(0, SEEN_MAX));
    return 0;
  }

  if (!(await notificationsEnabled())) {
    // Still record them, so turning notifications back on does not deliver
    // a backlog of everything that happened while they were off.
    await write(SEEN_KEY, [...ids, ...seen].slice(0, SEEN_MAX));
    return 0;
  }

  const known = new Set(seen);
  const fresh = items.filter((a) => a.id && !known.has(a.id) && WORTH_IT.has(a.type));

  if (fresh.length) {
    const { api } = await plugin();
    if (api) {
      try {
        await api.schedule({
          notifications: fresh.slice(0, 5).map((a, i) => ({
            // A stable id from the activity's own id, so the same event
            // cannot arrive twice if a refresh overlaps.
            id: hashId(a.id) + i,
            title: a.branch || "TechDesk",
            body: a.message || "New activity",
            smallIcon: "ic_stat_icon_config_sample",
            schedule: { at: new Date(Date.now() + 100) },
          })),
        });
      } catch {
        // No permission, or no plugin. The feed still updates on screen.
      }
    }
  }

  await write(SEEN_KEY, [...ids, ...seen].slice(0, SEEN_MAX));
  return fresh.length;
}

/** Android wants a positive 32-bit int; the id is a string. */
function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2_000_000;
}
