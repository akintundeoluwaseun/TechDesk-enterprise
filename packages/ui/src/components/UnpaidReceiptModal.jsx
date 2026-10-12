import React from "react";
import { AlertTriangle, X } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { useCloseOnBack } from "../lib/useCloseOnBack";
import { useSettings } from "../lib/SettingsContext";
import { money } from "../lib/currency";

/**
 * "This one still says Pending. Print it anyway?"
 *
 * A receipt is the shop's word that the money came in, and once it is in a
 * customer's hand -- printed, saved, sent -- it is hard to take back. The two
 * ways a shop arrives here are both ordinary: the amount was never typed in
 * on a sale that was in fact paid, or the customer really does still owe and
 * the receipt is going out early anyway. The first is a slip worth catching.
 * The second is a real thing shops do every day, so this asks rather than
 * refuses, and it is one tap to carry on.
 *
 * The balance is on the card rather than left to memory, because the question
 * "is this one paid?" is exactly what the shop has just got wrong or is about
 * to accept.
 *
 * It has to be asked before, not reported after: a toast once the paper is
 * out of the printer tells a shop something it can no longer act on.
 */
export default function UnpaidReceiptModal({ status, owed = 0, action = "print", onClose, onConfirm }) {
  const t = useThemeTokens();
  const { settings } = useSettings();
  useCloseOnBack(true, onClose);

  const verb = action === "print" ? "Print anyway" : "Send anyway";

  return (
    <div
      className="td-overlay fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/55 p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="This sale is not marked paid"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 ${
          t.dark ? "bg-neutral-950" : "bg-white"
        }`}
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-start justify-between mb-1 gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
            <h3 className={`text-base font-bold ${t.textPrimary}`}>
              This sale still says {String(status || "Pending").toLowerCase()}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Close" className={`p-1.5 shrink-0 ${t.textMuted}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className={`text-sm mb-4 ${t.textSecondary}`}>
          {owed > 0 ? (
            <>
              The receipt will show <span className="font-semibold">{money(owed, settings)}</span> still
              owing. If the customer has paid, close this and put the amount on
              the sale first.
            </>
          ) : (
            <>
              The receipt will not say it was paid in full. If the customer has
              paid, close this and put the amount on the sale first.
            </>
          )}
        </p>

        <div className="flex flex-col-reverse sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 py-3 rounded-xl text-sm font-medium ${t.pillBg}`}
          >
            Not yet
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`flex-1 py-3 rounded-xl text-sm font-semibold ${
              t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
            }`}
          >
            {verb}
          </button>
        </div>
      </div>
    </div>
  );
}
