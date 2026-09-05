import React, { useState } from "react";
import { X, ShoppingCart, Wrench, Box, BarChart3, Settings as SettingsIcon } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";

const STEPS = [
  { icon: ShoppingCart, text: "Sales (POS) — ring up a sale, take payment, print or email the receipt." },
  { icon: Wrench, text: "Repairs — log a device, track its status, print the repair ticket." },
  { icon: Box, text: "Inventory — manage stock and get low-stock alerts." },
  { icon: BarChart3, text: "Reports — see how the business is doing over any period." },
  { icon: SettingsIcon, text: "Settings — shop details, staff, backups, and LAN activity sharing." },
];

export default function TutorialModal({ onClose }) {
  const t = useThemeTokens();
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6">
      <div className={`w-full max-w-sm rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-bold ${t.textPrimary}`}>How to use TechDesk</h2>
          <button onClick={() => onClose(dontShowAgain)} className={t.textMuted}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 mb-5">
          {STEPS.map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.pillBg}`}>
                <Icon className={`w-4 h-4 ${t.textPrimary}`} />
              </div>
              <p className={`text-sm mt-1.5 ${t.textSecondary}`}>{text}</p>
            </div>
          ))}
        </div>

        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <span className={`text-sm ${t.textSecondary}`}>Don't show this on startup</span>
        </label>

        <button
          onClick={() => onClose(dontShowAgain)}
          className={`w-full py-3 rounded-xl font-semibold ${t.dark ? "bg-white text-black" : "bg-slate-900 text-white"}`}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
