import React, { useState } from "react";
import { X, Undo2 } from "lucide-react";
import { recordReturn, returnPlan } from "@techdesk/core";
import { useThemeTokens } from "../lib/ThemeContext";
import { useSettings } from "../lib/SettingsContext";
import { useAuth } from "../lib/AuthContext";
import { money } from "../lib/currency";
import { toast } from "../lib/toast";
import MoneyInput from "./MoneyInput";
import { useCloseOnBack } from "../lib/useCloseOnBack";

/**
 * Something came back. Until now the only way to record one was to tell the
 * Assistant; a shop doing twenty returns off one delivery had no button at
 * all. Pick the line, say how many came back and how much went out, and the
 * sale, the stock and the activity log all move together.
 */
export default function ReturnModal({ sale, onClose, onDone }) {
  const t = useThemeTokens();
  const { settings } = useSettings();
  const { user } = useAuth();
  const [idx, setIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [refund, setRefund] = useState(null);
  useCloseOnBack(true, onClose);

  const items = sale.items || [];
  const item = items[idx];
  const max = Number(item?.qty || 0);
  // What the shop would hand back if they said nothing: whatever this line
  // was actually paid for, never more than is left on the sale.
  const plan = item ? returnPlan(sale, idx, qty, refund) : null;
  const fmt = (n) => money(n || 0, settings);

  function save() {
    const done = recordReturn(sale.id, idx, { qty, refund, actor: user?.name || user?.email });
    if (!done) return;
    toast({
      title: `${done.back} × ${done.item.name} returned`,
      message: done.refund ? `${fmt(done.refund)} handed back · ${sale.invoice}` : sale.invoice,
    });
    onDone?.();
    onClose();
  }

  return (
    <div className="td-overlay fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Record a return"
        className={`w-full max-w-sm rounded-2xl p-5 ${t.cardBg}`}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className={`text-lg font-bold ${t.textPrimary}`}>Something came back</h2>
            <p className={`text-xs mt-0.5 truncate ${t.textMuted}`}>
              {sale.invoice} &middot; {sale.customerName || "Walk-in"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={`p-2 -m-1 rounded-full ${t.textMuted}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {items.length === 0 ? (
          <p className={`text-sm ${t.textSecondary}`}>There is nothing left on this sale to return.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.length > 1 && (
              <label className={`text-xs ${t.textMuted}`}>
                Which item
                <select
                  value={idx}
                  onChange={(e) => { setIdx(Number(e.target.value)); setQty(1); setRefund(null); }}
                  className={`w-full rounded-xl px-3 py-2.5 text-sm mt-1 ${t.inputBg}`}
                >
                  {items.map((it, i) => (
                    <option key={i} value={i}>{it.name} &middot; {it.qty} &times; {fmt(it.price)}</option>
                  ))}
                </select>
              </label>
            )}

            <label className={`text-xs ${t.textMuted}`}>
              How many came back {max > 1 && <span>(up to {max})</span>}
              <input
                type="number" min="1" max={max} value={qty}
                onChange={(e) => setQty(Math.min(max, Math.max(1, Math.round(Number(e.target.value) || 1))))}
                className={`w-full rounded-xl px-3 py-2.5 text-sm mt-1 tabular-nums ${t.inputBg}`}
              />
            </label>

            <label className={`text-xs ${t.textMuted}`}>
              Money handed back
              <MoneyInput
                value={refund ?? (plan ? plan.refund : 0)}
                onChange={(v) => setRefund(v === "" ? null : Number(v))}
                className={`w-full rounded-xl px-3 py-2.5 text-sm mt-1 tabular-nums ${t.inputBg}`}
              />
              <span className="block mt-1">
                Leave it as it is unless you gave back a different amount. Nothing is handed back on
                a sale that was never paid for &mdash; it just comes off what they owe.
              </span>
            </label>

            {plan && (
              <div className={`rounded-xl p-3 text-sm ${t.insetBg}`}>
                <div className="flex justify-between gap-3">
                  <span className={t.textSecondary}>Sale becomes</span>
                  <span className={`font-semibold tabular-nums ${t.textPrimary}`}>{fmt(plan.patch.total)}</span>
                </div>
                {item?.fromInventory && item?.productId && (
                  <div className={`text-xs mt-1 ${t.textMuted}`}>{plan.back} going back on the shelf.</div>
                )}
              </div>
            )}

            <button
              type="button" onClick={save}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}
            >
              <Undo2 className="w-4 h-4" /> Record the return
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
