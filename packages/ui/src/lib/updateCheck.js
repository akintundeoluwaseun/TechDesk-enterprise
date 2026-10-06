import { useEffect, useState } from "react";
import { appPlatform, appVersion } from "./announcements";
import { PLAY_STORE } from "./store";
import { platform } from "@techdesk/platform";
import { updateLink } from "./appControl";
import { onAppForeground } from "./foreground";

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

const APK_URL = (v) => `https://github.com/akintundeoluwaseun/TechDesk-releases-/releases/download/android-v${v}/TechDesk-${v}.apk`;

/**
 * The update notice's state. `mode` says what the shop can do about it:
 *   "restart"      desktop: downloaded, restart to install
 *   "downloading"  desktop: on its way, installs when TechDesk closes
 *   "android"      in-app: download and open Android's installer
 *   "download"     go to the download page (macOS, .deb/.rpm, or if the above failed)
 * `version` is null when there's nothing to show.
 */
export function useUpdateAvailable({ fetchImpl = typeof fetch !== "undefined" ? fetch : null } = {}) {
  const plat = appPlatform();
  const current = appVersion();
  const eligible = plat !== "web" && !PLAY_STORE && !!current;
  const [latest, setLatest] = useState(() => (eligible ? read(CACHE)?.[plat] || null : null));
  const [dismissed, setDismissed] = useState(() => read(DISMISSED));
  const [desktop, setDesktop] = useState({ state: "none", version: null });
  const [progress, setProgress] = useState(null); // 0..1 while the APK downloads
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!eligible || !fetchImpl) return undefined;
    let alive = true;
    async function check() {
      const cached = read(CACHE);
      if (cached?.at && Date.now() - cached.at < EVERY && cached[plat]) return;
      try {
        const res = await fetchImpl(RELEASES, { headers: { Accept: "application/vnd.github+json" } });
        if (!res.ok) return;
        const list = await res.json();
        const next = { at: Date.now(), desktop: latestFor("desktop", list), android: latestFor("android", list) };
        write(CACHE, next);
        if (alive) setLatest(next[plat]);
      } catch {
        // Offline: try again next time.
      }
    }
    check();
    const timer = setInterval(check, EVERY);
    window.addEventListener("online", check);
    const offForeground = onAppForeground(check);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("online", check); offForeground(); };
  }, [eligible, plat]);

  // The desktop app's own updater (Windows, Linux AppImage) reports here.
  useEffect(() => {
    const api = typeof window !== "undefined" ? window.techdesk : null;
    if (!eligible || plat !== "desktop" || !api?.onUpdateStatus) return undefined;
    api.updateStatus?.().then((s) => s && setDesktop(s)).catch(() => {});
    return api.onUpdateStatus((s) => setDesktop(s || { state: "none" }));
  }, [eligible, plat]);

  const newer = (v) => v && current && compareVersions(v, current) > 0;
  let mode = null;
  let version = null;
  const fromDesktop = desktop.version || latest;
  if (eligible && desktop.state === "ready" && newer(fromDesktop) && dismissed !== `ready:${fromDesktop}`) { mode = "restart"; version = fromDesktop; }
  else if (eligible && desktop.state === "downloading" && newer(fromDesktop) && dismissed !== `dl:${fromDesktop}`) { mode = "downloading"; version = fromDesktop; }
  // While the desktop updater has it in hand (downloading or downloaded), there's nothing to download by hand.
  else if (eligible && newer(latest) && dismissed !== latest && !["ready", "downloading"].includes(desktop.state)) {
    version = latest;
    let canInstall = false;
    try { canInstall = plat === "android" && !!platform().appUpdate; } catch { /* no adapter */ }
    mode = canInstall && !failed ? "android" : "download";
  }

  return {
    version,
    mode,
    progress,
    later() {
      // "Later" on the restart or download notice hides that one only: the
      // next stage (downloaded, ready) still gets its say.
      const key = mode === "restart" ? `ready:${version}` : mode === "downloading" ? `dl:${version}` : version;
      write(DISMISSED, key);
      setDismissed(key);
    },
    async act() {
      if (mode === "restart") return window.techdesk?.installUpdate?.();
      if (mode === "android") {
        setProgress(0);
        const res = await platform().appUpdate.install(APK_URL(version), setProgress);
        setProgress(null);
        if (!res?.ok) setFailed(true); // fall back to the download page
        return res;
      }
      if (mode === "download") platform().openExternal(updateLink());
      return null;
    },
  };
}
