import { useEffect, useState } from "react";
import { appPlatform, appVersion } from "./announcements";
import { PLAY_STORE } from "./store";

// "A new version is out." Installed apps (desktop and the website's Android
// APK) had no way to hear about one: the only notice was the console's
// forced minimum version. This asks the public releases page -- the same
// place the installers come from, so it's right the moment a build lands --
// at start and every six hours, and remembers the answer in between.
// The web app needs none of this (a reload is the update), and the Google
// Play build is updated by Google Play.
const RELEASES = "https://api.github.com/repos/akintundeoluwaseun/TechDesk-releases-/releases?per_page=15";
const CACHE = "techdesk_latest_release";
const DISMISSED = "techdesk_update_dismissed";
const EVERY = 6 * 60 * 60 * 1000;

/** -1, 0 or 1, comparing "4.10.0" and "4.9.2" as numbers. */
export function compareVersions(a, b) {
  const x = String(a || "").split(".").map((n) => parseInt(n, 10) || 0);
  const y = String(b || "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1;
  }
  return 0;
}

/** The newest version on the releases page for this platform, from GitHub's list. */
export function latestFor(platform, releases) {
  const tag = platform === "android" ? /^android-v(\d+\.\d+\.\d+)$/ : /^v(\d+\.\d+\.\d+)$/;
  return (releases || [])
    .filter((r) => !r.draft && !r.prerelease && (r.assets || []).length > 0)
    .map((r) => (String(r.tag_name || "").match(tag) || [])[1])
    .filter(Boolean)
    .sort((a, b) => compareVersions(b, a))[0] || null;
}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* fine */ }
}

/** {version} when a newer one is out and not put off, else null; and a way to put it off. */
export function useUpdateAvailable({ fetchImpl = typeof fetch !== "undefined" ? fetch : null } = {}) {
  const platform = appPlatform();
  const current = appVersion();
  const eligible = platform !== "web" && !PLAY_STORE && !!current;
  const [latest, setLatest] = useState(() => (eligible ? read(CACHE)?.[platform] || null : null));
  const [dismissed, setDismissed] = useState(() => read(DISMISSED));

  useEffect(() => {
    if (!eligible || !fetchImpl) return undefined;
    let alive = true;
    async function check() {
      const cached = read(CACHE);
      if (cached?.at && Date.now() - cached.at < EVERY && cached[platform]) return;
      try {
        const res = await fetchImpl(RELEASES, { headers: { Accept: "application/vnd.github+json" } });
        if (!res.ok) return;
        const list = await res.json();
        const next = { at: Date.now(), desktop: latestFor("desktop", list), android: latestFor("android", list) };
        write(CACHE, next);
        if (alive) setLatest(next[platform]);
      } catch {
        // Offline: try again next time.
      }
    }
    check();
    const timer = setInterval(check, EVERY);
    window.addEventListener("online", check);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("online", check); };
  }, [eligible, platform]);

  const show = eligible && latest && compareVersions(latest, current) > 0 && dismissed !== latest;
  return {
    version: show ? latest : null,
    later() { write(DISMISSED, latest); setDismissed(latest); },
  };
}
