import React from "react";
import { Home, Monitor, FileText, Settings, RefreshCw, LogOut, HelpCircle, Sun, Moon } from "lucide-react";
import { useTheme } from "../theme";

export const TABS = [
  { key: "home", label: "Home", Icon: Home },
  { key: "devices", label: "Branches", Icon: Monitor },
  { key: "reports", label: "Reports", Icon: FileText },
  { key: "settings", label: "Settings", Icon: Settings },
];

/** Phones: a floating glass bar at the bottom. */
export default function BottomNav({ tab, onChange }) {
  return (
    <nav
      data-tour="nav-phone"
      className="lg:hidden fixed z-20 left-1/2 -translate-x-1/2 flex rounded-[26px] border border-line bg-card/90 backdrop-blur-xl shadow-raised"
      style={{
        // Above Android's gesture bar, not under it.
        bottom: `calc(12px + env(safe-area-inset-bottom))`,
        width: "min(calc(100% - 24px), 440px)",
      }}
    >
      {TABS.map(({ key, label, Icon }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            aria-current={active ? "page" : undefined}
            className="flex-1 py-2.5 flex flex-col items-center gap-1"
          >
            <span
              className={`px-5 py-1.5 rounded-full transition-colors ${
                active ? "bg-ink/[0.08] text-ink" : "text-ink-faint"
              }`}
            >
              <Icon size={20} />
            </span>
            <span className={`text-[11px] ${active ? "text-ink font-semibold" : "text-ink-faint"}`}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Computers: a sidebar, the way a dashboard on a big screen should read. */
/** Sun or moon: switches between light and dark. */
export function ThemeButton({ className = "" }) {
  const [theme, toggle] = useTheme();
  const dark = theme === "dark";
  return (
    <button onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} className={className}>
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

export function SideNav({ tab, onChange, business, onRefresh, refreshing, onTour, onSignOut }) {
  const [theme, toggleTheme] = useTheme();
  return (
    <aside className="hidden lg:flex fixed z-20 inset-y-0 left-0 w-64 flex-col border-r border-line bg-side backdrop-blur-xl p-5">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl grid place-items-center bg-ink">
          <Monitor className="text-ground" size={20} />
        </div>
        <div className="min-w-0">
          <div className="font-bold leading-tight">TechDesk</div>
          <div className="text-xs text-ink-faint truncate">{business?.name || "HQ Monitoring"}</div>
        </div>
      </div>

      <nav data-tour="nav-desk" className="flex flex-col gap-1">
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active ? "bg-ink/[0.08] text-ink" : "text-ink-soft hover:bg-ink/[0.05] hover:text-ink"
              }`}
            >
              {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-ink" />}
              <Icon size={18} className={active ? "text-ink" : ""} /> {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1">
        <button onClick={onRefresh} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-ink-soft hover:bg-ink/[0.05] hover:text-ink">
          <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} /> Refresh now
        </button>
        <button onClick={toggleTheme} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-ink-soft hover:bg-ink/[0.05] hover:text-ink">
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />} {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <button onClick={onTour} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-ink-soft hover:bg-ink/[0.05] hover:text-ink">
          <HelpCircle size={17} /> Take the tour
        </button>
        <button onClick={onSignOut} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-500/10">
          <LogOut size={17} /> Sign out
        </button>
      </div>
    </aside>
  );
}
