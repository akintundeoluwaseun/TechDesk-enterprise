import { useEffect } from "react";
import { IS_ANDROID_APP } from "./platform";
import { onAppForeground } from "./foreground";

// Notifications pushed from the TechDesk console, per version.
//
// The app checks in on start, when it's brought back to the front, and every
// half hour: it says which platform and version it is (that's how the console
// knows which versions are out there), and gets back whatever is live for it.
// That list is kept on this device only -- it's not the shop's data, so it's
// never synced -- and feeds both the pop-up and the bell.
const URL_BASE = "https://wuwerzyydtvargvqjufb.supabase.co";
const KEY = "sb_publishable_aiiQjedgBx4Tq-NX_jIGtw_ekAYgxV_";
const STORE = "techdesk_announcements";
const SEEN = "techdesk_announcements_seen";
const EVERY = 30 * 60 * 1000;
const MIN_GAP = 2 * 60 * 1000;

export function appPlatform() {
  if (IS_ANDROID_APP) return "android";
  if (typeof window !== "undefined" && window.techdesk) return "desktop";
  return "web";
}

/** The version the build was stamped with, or null in dev and tests. */
export function appVersion() {
  // eslint-disable-next-line no-undef
  return typeof __TECHDESK_VERSION__ !== "undefined" ? __TECHDESK_VERSION__ : null;
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full: the next check-in fetches them again anyway.
  }
}

export function storedAnnouncements() {
  const list = read(STORE, []);
  return Array.isArray(list) ? list : [];
}

export function unseenAnnouncements(list = storedAnnouncements()) {
  const seen = new Set(read(SEEN, []));
  return list.filter((a) => a && a.id && !seen.has(a.id));
}

export function markAnnouncementSeen(id) {
  const seen = read(SEEN, []);
  if (!seen.includes(id)) write(SEEN, [...seen, id].slice(-200));
}

/** The bell's view of them, in the shape core's notification feed uses. */
export function announcementFeedItems() {
  return storedAnnouncements().map((a) => ({
    id: `announcement-${a.id}`,
    type: "announcement",
    message: a.body ? `${a.title} — ${a.body}` : a.title,
    createdAt: a.created_at,
  }));
}

/**
 * Check in and refresh the stored list. Returns the live list, or null when
 * there's nothing to do (a dev build with no version) or the network isn't
 * there -- in which case what's stored is left exactly as it was.
 */
export async function checkIn({ fetchImpl = typeof fetch !== "undefined" ? fetch : null } = {}) {
  const version = appVersion();
  if (!version || !fetchImpl) return null;
  let res;
  try {
    res = await fetchImpl(`${URL_BASE}/rest/v1/rpc/app_checkin`, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_platform: appPlatform(), p_version: version }),
    });
  } catch {
    return null;
  }
  if (!res || !res.ok) return null;
  const list = await res.json().catch(() => null);
  if (!Array.isArray(list)) return null;
  // Replaced, not merged: one switched off in the console leaves the bell too.
  write(STORE, list);
  return list;
}

/** Checks in on mount, on focus and every half hour; hands the newest unseen one to onNew. */
export function useAnnouncementCheck(onNew) {
  useEffect(() => {
    let alive = true;
    let last = 0;
    async function run() {
      const now = Date.now();
      if (now - last < MIN_GAP) return;
      last = now;
      const list = await checkIn();
      if (!alive || !list) return;
      const fresh = unseenAnnouncements(list);
      if (fresh.length) onNew(fresh[0]);
    }
    run();
    const timer = setInterval(run, EVERY);
    const offForeground = onAppForeground(run);
    return () => {
      alive = false;
      clearInterval(timer);
      offForeground();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
