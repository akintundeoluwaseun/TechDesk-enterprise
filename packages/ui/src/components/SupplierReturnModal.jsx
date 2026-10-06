import React, { useMemo, useState } from "react";
import { X, Search, Undo2, PackageMinus } from "lucide-react";
import { sendBackToSupplier, creditTotal, RETURN_REASONS } from "@techdesk/core";
import { db } from "../lib/db";
import { useThemeTokens } from "../lib/ThemeContext";
import { useSettings } from "../lib/SettingsContext";
import { useAuth } from "../lib/AuthContext";
import { money } from "../lib/currency";
import { toast } from "../lib/toast";
import { useCloseOnBack } from "../lib/useCloseOnBack";

/**
 * A delivery going back to the supplier.
 *
 * A shop buying in bulk sends things back in bulk: twenty lines off one
 * delivery, on one day, to one supplier. Doing that as twenty separate
 * operations is the headache. So this is a checklist of the shop's stock --
 * tick what is going, say how many, and one note covers the lot.
 */
export default function SupplierReturnModal({ onClose, onDone }) {
  const t = useThemeTokens();
  const { settings } = useSettings();
  const { user } = useAuth();
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState({}); // productId -> { qty, reason }
  useCloseOnBack(true, onClose);

  const inventory = useMemo(() => db.getInventory().filter((p) => Number(p.stock || 0) > 0), []);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? inventory.filter((p) => p.name?.toLowerCase().includes(q)) : inventory;
  }, [inventory, search]);

  const lines = Object.entries(picked)
    .filter(([, v]) => v.qty > 0)
    .map(([productId, v]) => {
      const p = inventory.find((x) => x.id === productId);
      return { productId, qty: v.qty, reason: v.reason, unitCost: Number(p?.costPrice || 0) };
    });
  const credit = creditTotal(lines);
  const fmt = (n) => money(n || 0, settings);

  function setQty(p, qty) {
    const capped = Math.max(0, Math.min(Number(p.stock || 0), Math.round(Number(qty) || 0)));
    setPicked((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] || { reason: "" }), qty: capped } }));
  }

  function save() {
    const out = sendBackToSupplier({
      supplier: supplier.trim() || "Supplier",
      reference: reference.trim(),
      lines,
      actor: user?.name || user?.email,
    });
    if (!out) return;
    toast({
      title: `${out.record.lines.length} item${out.record.lines.length === 1 ? "" : "s"} sent back`,
      message: `${out.record.supplier} · ${fmt(out.credit)} to come back to you`,
    });
    onDone?.();
    onClose();
  }

  return (
    <div className="td-overlay fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Send goods back to a supplier"
        className={`w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl ${t.cardBg}`}>

        <div className={`shrink-0 flex items-start justify-between gap-3 p-5 pb-3`}>
          <div className="min-w-0">
            <h2 className={`text-lg font-bold ${t.textPrimary}`}>Send back to a supplier</h2>
            <p className={`text-xs mt-0.5 ${t.textMuted}`}>
              Damaged, wrong or not selling. Stock comes off the shelf and you keep a note of what
              you are owed.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={`p-2 -m-1 rounded-full ${t.textMuted}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="shrink-0 px-5 pb-3 grid grid-cols-2 gap-2">
          <label className={`text-xs ${t.textMuted}`}>
            Supplier
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Who it goes back to"
              className={`w-full rounded-xl px-3 py-2.5 text-sm mt-1 ${t.inputBg}`} />
          </label>
          <label className={`text-xs ${t.textMuted}`}>
            Their invoice <span>(if you have it)</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional"
              className={`w-full rounded-xl px-3 py-2.5 text-sm mt-1 ${t.inputBg}`} />
          </label>
        </div>

        <div className="shrink-0 px-5 pb-3">
          <div className={`flex items-center gap-2 rounded-full px-3 py-2 ${t.inputBg}`}>
            <Search className={`w-4 h-4 shrink-0 ${t.textMuted}`} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a product…"
              className="bg-transparent outline-none text-sm flex-1 min-w-0" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {shown.length === 0 ? (
            <p className={`py-6 text-sm text-center ${t.textMuted}`}>
              {inventory.length === 0 ? "Nothing in stock to send back." : "No product by that name."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {shown.map((p) => {
                const row = picked[p.id] || { qty: 0, reason: "" };
                const on = row.qty > 0;
                return (
                  <li key={p.id} className={`rounded-2xl p-3 border ${on ? "border-amber-500/60" : t.divider}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold truncate ${t.textPrimary}`}>{p.name}</div>
                        <div className={`text-xs ${t.textMuted}`}>
                          {p.stock} on the shelf &middot; cost {fmt(p.costPrice)}
                        </div>
                      </div>
                      <input
                        type="number" min="0" max={p.stock} value={row.qty || ""}
                        onChange={(e) => setQty(p, e.target.value)}
                        aria-label={`How many ${p.name} go back`}
                        placeholder="0"
                        className={`w-20 shrink-0 rounded-xl px-3 py-2 text-sm text-center tabular-nums ${t.inputBg}`}
                      />
                    </div>
                    {on && (
                      <select
                        value={row.reason}
                        onChange={(e) => setPicked((prev) => ({ ...prev, [p.id]: { ...prev[p.id], reason: e.target.value } }))}
                        aria-label={`Why ${p.name} is going back`}
                        className={`w-full rounded-xl px-3 py-2 text-xs mt-2 ${t.inputBg}`}
                      >
                        <option value="">Why is it going back?</option>
                        {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={`shrink-0 border-t ${t.divider} p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]`}>
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <span className={`text-sm ${t.textSecondary}`}>
              {lines.length} item{lines.length === 1 ? "" : "s"}, {lines.reduce((n, l) => n + l.qty, 0)} in all
            </span>
            <span className={`text-lg font-bold tabular-nums ${t.textPrimary}`}>{fmt(credit)}</span>
          </div>
          <button
            type="button" onClick={save} disabled={lines.length === 0}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold disabled:opacity-50 ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}
          >
            <PackageMinus className="w-4 h-4" /> Send these back
          </button>
          <p className={`text-xs text-center mt-2 ${t.textMuted}`}>
            <Undo2 className="w-3 h-3 inline -mt-0.5" /> Stock comes off now. Nothing is sent to anyone &mdash;
            this is your own record of what you are owed.
          </p>
        </div>
      </div>
    </div>
  );
}
