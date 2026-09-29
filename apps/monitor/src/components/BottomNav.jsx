import React from "react";
import { Home, Monitor, FileText, Settings } from "lucide-react";

const TABS = [
  { key: "home", label: "Home", Icon: Home },
  { key: "devices", label: "Devices", Icon: Monitor },
  { key: "reports", label: "Reports", Icon: FileText },
  { key: "settings", label: "Settings", Icon: Settings },
];

export default function BottomNav({ tab, onChange }) {
  return (
    <nav
      className="fixed z-20 bg-card rounded-xl2 shadow-raised flex"
      style={{
        // Above Android's gesture bar, not under it.
        bottom: `calc(12px + env(safe-area-inset-bottom))`,
        // `fixed` is relative to the viewport, not to the app's own
        // phone-width column, so it has to be told that column's width and
        // centered by hand -- otherwise it stretches edge to edge on a wide
        // browser while everything above it stays narrow.
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(calc(100% - 24px), 424px)",
      }}
    >
      {TABS.map(({ key, label, Icon }) => {
        const active = tab === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            aria-current={active ? "page" : undefined}
            className="flex-1 py-3 flex flex-col items-center gap-1"
          >
            <span
              className={`px-5 py-1.5 rounded-full transition-colors ${
                active ? "bg-blue-50 text-blue-600" : "text-ink-faint"
              }`}
            >
              <Icon size={20} />
            </span>
            <span className={`text-[11px] ${active ? "text-blue-600 font-medium" : "text-ink-faint"}`}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
