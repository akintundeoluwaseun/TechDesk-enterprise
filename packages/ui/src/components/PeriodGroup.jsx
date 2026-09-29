import React from "react";
import { ChevronDown } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";

/**
 * One Today / This Week / This Month / Older section on Sales or Repairs --
 * a plain header a shop can shut, not another card. The rows under it are
 * already cards; wrapping them in a second one just for the label would
 * nest a card inside a card for no reason.
 */
export default function PeriodGroup({ label, count, open, onToggle, children }) {
  const t = useThemeTokens();
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-1 py-2"
      >
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform ${t.textMuted} ${open ? "" : "-rotate-90"}`}
          aria-hidden="true"
        />
        <span className={`text-sm font-semibold ${t.textPrimary}`}>{label}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.pillBg}`}>{count}</span>
      </button>
      {open && <div className="td-open td-stagger flex flex-col gap-3">{children}</div>}
    </div>
  );
}
