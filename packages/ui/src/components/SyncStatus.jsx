import React, { useEffect, useState } from "react";
import { RefreshCw, CloudOff, Check } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { subscribeSync, runSync, getSyncState } from "../lib/syncEngine";

// Whether the shop is up to date, in the menu, where it is always in sight.
//
// A device that reports to head office or shares with the bench next door was
// doing both silently: the only way to find out whether anything had actually
// gone up was to open Settings, find the right tab, and read a line of small
// print. A shop with no internet since yesterday looked exactly like a shop
// that was up to date.
//
// It is not shown at all on a device that is part of no shop. A sync button
// on a free single-till install is an offer of something that does not apply.

function ago(iso) {
  if (!iso) return null;
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(secs) || secs < 0) return null;
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * @param {"sidebar"|"sheet"} variant  where it is being drawn
 * @param {boolean} collapsed          the sidebar is icons-only
 */
export default function SyncStatus({ variant = "sidebar", collapsed = false }) {
  const t = useThemeTokens();
  const [sync, setSync] = useState(getSyncState);
  const [online, setOnline] = useState(
    () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
  );

  useEffect(() => subscribeSync(setSync), []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // connected === null means the answer is not in yet. Nothing is drawn, so
  // the menu does not flicker a button in and back out on every launch.
  if (!sync.connected) return null;

  const waiting = sync.waiting || 0;
  const when = ago(sync.lastSyncAt);

  const line = !online
    ? "Offline — nothing lost"
    : sync.busy
      ? "Syncing…"
      : waiting > 0
        ? `${waiting} waiting`
        : when
          ? `Synced ${when}`
          : "Synced";

  const Icon = !online ? CloudOff : waiting === 0 && !sync.busy ? Check : RefreshCw;

  const title = collapsed ? line : undefined;

  return (
    <button
      onClick={() => runSync({ loud: true })}
      disabled={sync.busy}
      title={title}
      aria-label={`Sync now. ${line}`}
      className={`flex items-center gap-2 rounded-xl text-sm ${
        variant === "sheet" ? "w-full px-4 py-3" : "py-2.5 px-3"
      } ${collapsed ? "justify-center" : ""} ${t.pillBg} ${sync.busy ? "opacity-70" : ""}`}
    >
      <Icon
        className={`w-4 h-4 shrink-0 ${sync.busy ? "animate-spin" : ""} ${
          !online ? "text-amber-500" : waiting > 0 ? "text-blue-500" : t.textSecondary
        }`}
      />
      {!collapsed && (
        <span className={`truncate ${t.textSecondary}`}>{line}</span>
      )}
    </button>
  );
}
