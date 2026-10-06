import React from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, Sunrise, Wallet, PackageSearch, Sun, Moon, HelpCircle } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { useAuth, canAccess } from "../lib/AuthContext";
import { useCloseOnBack } from "../lib/useCloseOnBack";

/**
 * The extras, in a sheet rather than down the menu.
 *
 * They used to hang off a "More" row that expanded in place, which made both
 * the sidebar and the phone drawer taller the moment you opened it -- on a
 * small phone, and worse in landscape, the menu then ran off the screen and
 * the thing you wanted was below the fold. A sheet is the same height
 * whatever is in it, and puts the four of them where a thumb already is.
 */
export default function MoreSheet({ onClose, items }) {
  const t = useThemeTokens();
  useCloseOnBack(true, onClose);

  // Through a portal to the body. Both surfaces that open this render it from
  // inside themselves -- the sidebar is a sticky <aside>, the phone menu is a
  // fixed drawer -- and a fixed child is confined to whatever stacking
  // context its ancestors make, so on a desktop the sheet came out behind the
  // page. Hanging it off the body puts it where every other dialog lives.
  const sheet = (
    <div
      className="td-overlay fixed inset-0 z-[66] flex items-end sm:items-center justify-center bg-black/60 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="More"
        className={`w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] ${t.cardBg}`}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className={`text-lg font-bold ${t.textPrimary}`}>More</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={`p-2 -m-1 rounded-full ${t.textMuted}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.label}
                type="button"
                onClick={() => { onClose(); it.onClick(); }}
                className={`relative flex flex-col items-start gap-2.5 p-3.5 rounded-2xl text-left border ${t.divider} ${t.insetBg}`}
              >
                <span className={`flex items-center justify-center w-10 h-10 rounded-xl ${it.tone}`}>
                  <Icon className="w-5 h-5" strokeWidth={2} />
                </span>
                <span className={`text-sm font-semibold leading-tight ${t.textPrimary}`}>{it.label}</span>
                {it.dot && (
                  <span className="absolute top-3 right-3 flex w-2 h-2">
                    <span className="absolute inset-0 rounded-full bg-sky-400 animate-ping" />
                    <span className="relative w-2 h-2 rounded-full bg-sky-500" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? sheet : createPortal(sheet, document.body);
}

/**
 * The same four everywhere, so the sidebar and the phone menu can't drift.
 * `extra` is for what only one of them offers -- the phone's theme and help.
 */
export function moreItems({ user, unseenUpdate, openRestock, openChaser, openBrief, openWhatsNew, extra = [] }) {
  const items = [];
  if (canAccess(user, "/inventory")) {
    items.push({ label: "Restock planner", icon: PackageSearch, onClick: openRestock, tone: "bg-teal-500/15 text-teal-600 dark:text-teal-400" });
  }
  if (canAccess(user, "/sales")) {
    items.push({ label: "Money owed", icon: Wallet, onClick: openChaser, tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400" });
  }
  items.push({ label: "Morning brief", icon: Sunrise, onClick: openBrief, tone: "bg-rose-500/15 text-rose-600 dark:text-rose-400" });
  items.push({ label: "What's new", icon: Sparkles, onClick: openWhatsNew, dot: unseenUpdate, tone: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" });
  return [...items, ...extra];
}

export { Sun, Moon, HelpCircle };
