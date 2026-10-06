import { useEffect, useState } from "react";
import { readAppControl, saveAppControl } from "@techdesk/core";
import { SITE_ORIGIN } from "@techdesk/editions";
import { appPlatform, appVersion } from "./announcements";
import { onAppForeground } from "./foreground";

// The owner's console, as this app sees it (migration 0037's app_control):
// a minimum version, a maintenance notice, and the feature switches. Asked
// on start, when the app comes back to the front, and every half hour; the
// last answer is kept, so switches hold offline and across restarts.
const URL_BASE = "https://wuwerzyydtvargvqjufb.supabase.co";
const KEY = "sb_publishable_aiiQjedgBx4Tq-NX_jIGtw_ekAYgxV_";
const EVERY = 30 * 60 * 1000;
const MIN_GAP = 60 * 1000;

export async function fetchAppControl({ fetchImpl = typeof fetch !== "undefined" ? fetch : null } = {}) {
  const version = appVersion();
  if (!version || !fetchImpl) return null;
  try {
    const res = await fetchImpl(`${URL_BASE}/rest/v1/rpc/app_control`, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_platform: appPlatform(), p_version: version }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== "object" || !("features" in data)) return null;
    saveAppControl(data);
    return data;
  } catch {
    return null;
  }
}

/** The stored answer right away, then the fresh one when it lands. */
export function useAppControl() {
  const [control, setControl] = useState(() => readAppControl());
  useEffect(() => {
    let alive = true;
    let last = 0;
    async function run() {
      if (Date.now() - last < MIN_GAP) return;
      last = Date.now();
      const next = await fetchAppControl();
      if (alive && next) setControl(next);
    }
    run();
    const timer = setInterval(run, EVERY);
    const offForeground = onAppForeground(run);
    return () => {
      alive = false;
      clearInterval(timer);
      offForeground();
    };
  }, []);
  return control;
}

/** Where a shop gets the new version, for the platform it's on. */
export function updateLink() {
  return appPlatform() === "android"
    ? `${SITE_ORIGIN}/download-android`
    : `${SITE_ORIGIN}/download`;
}
