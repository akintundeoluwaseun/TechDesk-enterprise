import React from "react";
import { ChevronDown } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";

/**
 * An optional group of fields, shut until somebody wants it.
 *
 * Settings asked too much. Fields most shops never fill in -- a website, a
 * VAT id, the wording of a WhatsApp message -- sat open beside the ones
 * everybody needs, and a form that asks eleven questions to print a receipt
 * reads like paperwork.
 *
 * Not a modal, unlike SettingsRow: these are fields you fill in while looking
 * at the ones above them, and sending them to a separate panel would separate
 * them from what they belong to. The summary says whether there is anything
 * inside, so shut is not the same as unknown.
 */
export default function Fold({ open, onToggle, title, summary, children }) {
  const t = useThemeTokens();
  return (
    <div className={`rounded-2xl ${t.cardBg}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 p-6 text-left"
      >
        <div className="min-w-0">
          <h3 className={`font-semibold ${t.textPrimary}`}>{title}</h3>
          {summary && <p className={`text-sm mt-1 ${t.textSecondary}`}>{summary}</p>}
        </div>
        <ChevronDown
          className={`w-5 h-5 shrink-0 transition-transform ${t.textMuted} ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}
