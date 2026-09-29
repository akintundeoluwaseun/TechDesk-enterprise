import React, { useState } from "react";
import {
  X,
  LayoutGrid,
  ShoppingCart,
  Wrench,
  Box,
  Users,
  BarChart3,
  ClipboardList,
  Settings as SettingsIcon,
  Keyboard,
} from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { can } from "../lib/tier";
import { useCloseOnBack } from "../lib/useCloseOnBack";
import { MOD_KEY_LABEL } from "./Topbar";

const STEPS = [
  { icon: LayoutGrid, text: "Dashboard — today's sales and repairs at a glance, plus quick actions to start a new sale or repair." },
  { icon: ShoppingCart, text: "Sales (POS) — ring up a sale, take payment, and print the receipt.",
    paid: { feature: "receiptPdf", text: "Save it as a PDF or send it on WhatsApp." } },
  { icon: Wrench, text: "Repairs — log a device, track it from received to delivered, and print the repair ticket." },
  { icon: Box, text: "Inventory — track stock and cost vs. selling price, with alerts when something's running low." },
  { icon: Users, text: "Customers — every customer's contact details and their full sales & repair history." },
  { icon: BarChart3, text: "Reports — revenue, profit, and repair trends over any time period." },
  { icon: ClipboardList, text: "Activity Logs — a running history of every sale, repair, and change made on this device." },
  { icon: SettingsIcon, text: "Settings — shop details, receipt formatting, and backups.",
    paid: { feature: "staff", text: "Staff accounts and head office live here too." } },
];

// Only shortcuts that are actually wired up belong here.
const SHORTCUTS = [
  { keys: [MOD_KEY_LABEL, "K"], what: "Jump to search from anywhere" },
  { keys: [MOD_KEY_LABEL, "Enter"], what: "Complete the sale you're ringing up" },
  { keys: ["Esc"], what: "Close the open dialog, or clear the search box" },
  { keys: ["Enter"], what: "In New Sale, add the scanned or typed SKU to the cart" },
];

export default function TutorialModal({ onClose, onStartTour }) {
  const t = useThemeTokens();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  // Same as tapping the X: dismisses without acting on the checkbox.
  useCloseOnBack(true, () => onClose(dontShowAgain));

  return (
    <div className="td-overlay fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6">
      <div className={`w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h2 className={`text-lg font-bold ${t.textPrimary}`}>How to use TechDesk</h2>
          <button onClick={() => onClose(dontShowAgain)} className={t.textMuted}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 mb-5 overflow-y-auto">
          {STEPS.map(({ icon: Icon, text, paid }, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.pillBg}`}>
                <Icon className={`w-4 h-4 ${t.textPrimary}`} />
              </div>
              <p className={`text-sm mt-1.5 ${t.textSecondary}`}>
                {text}
                {/* Named as an upgrade only to a shop that has not got it.
                    A shop that already paid should just read the feature as
                    theirs, not be sold it again. */}
                {paid && !can(paid.feature) ? (
                  <span className={`block mt-0.5 ${t.textMuted}`}>{paid.text} (Business)</span>
                ) : null}
              </p>
            </div>
          ))}

          {/* No keyboard on a phone, so the shortcut list is desktop-only. */}
          <div className={`hidden md:block mt-2 pt-4 ${t.dark ? "border-t border-white/10" : "border-t border-white/50"}`}>
            <div className="flex items-center gap-2 mb-3">
              <Keyboard className={`w-4 h-4 ${t.textPrimary}`} />
              <h3 className={`text-sm font-semibold ${t.textPrimary}`}>Keyboard shortcuts</h3>
            </div>
            <div className="flex flex-col gap-2">
              {SHORTCUTS.map(({ keys, what }) => (
                <div key={what} className="flex items-center justify-between gap-3">
                  <span className={`text-sm ${t.textSecondary}`}>{what}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {keys.map((k) => (
                      <kbd
                        key={k}
                        className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                          t.dark ? "bg-white/10 text-neutral-200" : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 mb-4 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <span className={`text-sm ${t.textSecondary}`}>Don't show this on startup</span>
        </label>

        {onStartTour && (
          <button
            onClick={onStartTour}
            className={`w-full py-3 mb-2 rounded-xl font-semibold shrink-0 ${t.pillBg}`}
          >
            Take the guided tour
          </button>
        )}
        <button
          onClick={() => onClose(dontShowAgain)}
          className={`w-full py-3 rounded-xl font-semibold shrink-0 ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
