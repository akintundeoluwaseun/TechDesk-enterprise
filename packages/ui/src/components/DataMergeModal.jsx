import React, { useState } from "react";
import { X, Database, ShoppingCart, Wrench, Box, Users, Check, AlertTriangle } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { mergeFromEdition, setMergeDecision } from "../lib/editionData";

function timeAgo(iso) {
  const then = new Date(iso);
  if (isNaN(then.getTime())) return "";
  const mins = Math.round(Math.max(0, Date.now() - then.getTime()) / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const COUNT_ROWS = [
  { key: "sales", label: "sales", Icon: ShoppingCart },
  { key: "repairs", label: "repairs", Icon: Wrench },
  { key: "inventory", label: "products", Icon: Box },
  { key: "customers", label: "customers", Icon: Users },
];

function plural(n, singular, pluralForm) {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export default function DataMergeModal({ editions, onClose }) {
  const t = useThemeTokens();
  const [selected, setSelected] = useState(editions[0]?.file || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const chosen = editions.find((e) => e.file === selected) || editions[0];

  async function handleMerge() {
    if (!chosen) return;
    setBusy(true);
    setError("");
    try {
      const merged = await mergeFromEdition(chosen.file);
      setMergeDecision("merged");
      setResult(merged);
    } catch (err) {
      setError(err?.message || "Couldn't merge that data.");
    } finally {
      setBusy(false);
    }
  }

  function handleKeepSeparate() {
    setMergeDecision("separate");
    onClose();
  }

  const panel = t.cardBg;

  if (result) {
    const total = Object.values(result.added).reduce((a, b) => a + b, 0);
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-6">
        <div className={`w-full max-w-md rounded-2xl p-6 ${panel}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <Check className="w-5 h-5 text-emerald-500" />
            </div>
            <h2 className={`text-lg font-bold ${t.textPrimary}`}>Data brought across</h2>
          </div>
          <p className={`text-sm mb-4 ${t.textSecondary}`}>
            {total > 0
              ? `Added ${plural(result.added.sales, "sale", "sales")}, ${plural(
                  result.added.repairs,
                  "repair",
                  "repairs"
                )}, ${plural(result.added.inventory, "product", "products")} and ${plural(
                  result.added.customers,
                  "customer",
                  "customers"
                )} from ${chosen.edition}.`
              : `Everything in ${chosen.edition} was already here, so nothing needed adding.`}
            {result.settingsCopied && " Your shop details came across too."}
          </p>
          <p className={`text-xs mb-5 ${t.textMuted}`}>
            {chosen.edition} still has its own copy — nothing there was changed or removed.
          </p>
          <button
            onClick={() => {
              // every open page is showing pre-merge data, so start clean
              if (total > 0) window.location.reload();
              else onClose();
            }}
            className={`w-full py-3 rounded-xl font-semibold ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-6">
      <div className={`w-full max-w-md max-h-[85vh] flex flex-col rounded-2xl p-6 ${panel}`}>
        <div className="flex items-start justify-between mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.pillBg}`}>
              <Database className={`w-5 h-5 ${t.textPrimary}`} />
            </div>
            <h2 className={`text-lg font-bold ${t.textPrimary}`}>We found existing TechDesk data</h2>
          </div>
          <button onClick={handleKeepSeparate} className={t.textMuted} title="Keep separate">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className={`text-sm mb-4 shrink-0 ${t.textSecondary}`}>
          Another TechDesk edition on this device already has records. Do you want to bring them
          into this app, or keep the two completely separate?
        </p>

        <div className="flex flex-col gap-2 mb-4 overflow-y-auto">
          {editions.map((e) => {
            const isSelected = e.file === selected;
            return (
              <button
                key={e.file}
                type="button"
                onClick={() => setSelected(e.file)}
                className={`text-left rounded-xl p-4 transition-colors ${
                  editions.length > 1 && isSelected
                    ? t.dark
                      ? "bg-white/10 border border-white/30"
                      : "bg-white/50 border border-white/80"
                    : t.dark
                    ? "bg-white/5 border border-white/10"
                    : "bg-white/25 border border-white/50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-semibold text-sm ${t.textPrimary}`}>{e.edition}</span>
                  <span className={`text-xs ${t.textMuted}`}>saved {timeAgo(e.savedAt)}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {COUNT_ROWS.filter(({ key }) => e.counts[key] > 0).map(({ key, label, Icon }) => (
                    <span key={key} className={`flex items-center gap-1.5 text-xs ${t.textSecondary}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {e.counts[key]} {label}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div
          className={`flex items-start gap-2.5 rounded-xl p-3 mb-4 shrink-0 ${
            t.dark ? "bg-amber-500/10 border border-amber-500/20" : "bg-amber-50 border border-amber-200"
          }`}
        >
          <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${t.dark ? "text-amber-300" : "text-amber-600"}`} />
          <p className={`text-xs ${t.textSecondary}`}>
            This copies the records across once — the two apps don't stay in sync afterwards.
            Nothing is removed from the other edition.
          </p>
        </div>

        {error && <p className="text-xs text-red-500 mb-3 shrink-0">{error}</p>}

        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={handleMerge}
            disabled={busy || !chosen}
            className={`w-full py-3 rounded-xl font-semibold disabled:opacity-50 ${
              t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
            }`}
          >
            {busy ? "Merging…" : `Merge ${chosen ? chosen.edition + "'s" : ""} data into this app`}
          </button>
          <button
            onClick={handleKeepSeparate}
            disabled={busy}
            className={`w-full py-3 rounded-xl font-medium disabled:opacity-50 ${t.pillBg} ${t.textPrimary}`}
          >
            Keep them separate
          </button>
        </div>
      </div>
    </div>
  );
}
