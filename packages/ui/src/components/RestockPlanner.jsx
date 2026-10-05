import React, { useMemo, useState } from "react";
import { X, PackageSearch, Minus, Plus, MessageCircle, PackageCheck, Undo2, ChevronDown, Settings2 } from "lucide-react";
import { buildRestockPlan, restockSettings, saveRestockSettings, fitToBudget, orderTotal, orderText, receiveOrder, runRestockUndo, addHistory } from "@techdesk/core";
import { useThemeTokens } from "../lib/ThemeContext";
import { useCloseOnBack } from "../lib/useCloseOnBack";
import { useAuth } from "../lib/AuthContext";
import { useSettings } from "../lib/SettingsContext";
import { money } from "../lib/currency";
import { openWhatsApp } from "../lib/share";
import MoneyInput from "./MoneyInput";
import { VOICE_SAVED_EVENT } from "./VoiceOrder";

// The restock planner: what to buy, how many, what it costs. Everything is
// worked out on the device (core/restockPlanner.js). The order can go to a
// supplier on WhatsApp, and when the goods arrive one tap adds them to stock.

const SECTIONS = [
  { status: "out", title: "Out of stock", tone: "text-rose-500" },
  { status: "now", title: "Order now", tone: "text-amber-500" },
  { status: "soon", title: "Order soon", tone: "text-sky-500" },
  { status: "low", title: "Under the low-stock mark", tone: "" },
];

function Stepper({ value, onChange, t }) {
  return (
    <div className={`flex items-center rounded-full ${t.insetBg}`}>
      <button type="button" aria-label="Fewer" onClick={() => onChange(Math.max(0, value - 1))} className="p-1.5"><Minus className="w-3.5 h-3.5" /></button>
      <input value={value} inputMode="numeric" aria-label="How many to buy"
        onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value.replace(/\D/g, "")) || 0)))}
        className="w-10 text-center bg-transparent text-sm font-semibold tabular-nums outline-none" />
      <button type="button" aria-label="More" onClick={() => onChange(value + 1)} className="p-1.5"><Plus className="w-3.5 h-3.5" /></button>
    </div>
  );
}

export default function RestockPlanner({ onClose }) {
  const t = useThemeTokens();
  const { user } = useAuth();
  const { settings } = useSettings();
  useCloseOnBack(true, onClose);
  const fmt = (n) => money(n || 0, settings);
  const [prefs, setPrefs] = useState(restockSettings);
  const [showPrefs, setShowPrefs] = useState(false);
  const [tick, setTick] = useState(0);
  const plan = useMemo(() => buildRestockPlan({}, new Date(), prefs), [prefs, tick]);
  const [qty, setQty] = useState({});
  const [showIdle, setShowIdle] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [costs, setCosts] = useState({});
  const [done, setDone] = useState(null); // {added, undo}

  const base = useMemo(() => fitToBudget(plan.lines, qty, prefs.budget), [plan, qty, prefs.budget]);
  const q = (l) => base[l.id] ?? l.suggest;
  const ordering = plan.lines.filter((l) => q(l) > 0);
  const total = orderTotal(plan.lines, base);

  function setPref(patch) {
    setPrefs(saveRestockSettings({ ...prefs, ...patch }));
    setQty({});
  }
  function send() {
    openWhatsApp("", orderText(plan.lines, base, { shop: settings.shopName }));
    addHistory(`Restock list sent · ${ordering.length} products`, "check");
  }
  function receive() {
    const out = receiveOrder(plan.lines, base, { costs, actor: user?.name });
    if (out.added) {
      addHistory(`Stock received · ${out.added} products`);
      setDone(out);
      setReceiving(false);
      setQty({});
      setTick((n) => n + 1);
      window.dispatchEvent(new CustomEvent(VOICE_SAVED_EVENT));
    }
  }
  function undo() {
    runRestockUndo(done.undo);
    setDone(null);
    setTick((n) => n + 1);
    window.dispatchEvent(new CustomEvent(VOICE_SAVED_EVENT));
  }

  return (
    <div className="td-overlay fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/60 sm:p-6" role="dialog" aria-modal="true" aria-label="Restock planner">
      <div className={`w-full sm:max-w-lg h-[94vh] sm:h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden ${t.cardBg}`}>
        <div className={`flex items-start gap-3 px-5 pt-5 pb-4 border-b ${t.divider}`}>
          <span className="w-10 h-10 shrink-0 rounded-xl bg-violet-500/15 text-violet-500 flex items-center justify-center"><PackageSearch className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <h2 className={`text-lg font-bold ${t.textPrimary}`}>Restock planner</h2>
            <div className={`text-sm ${t.textSecondary}`}>
              {ordering.length
                ? <>Buy <b className={t.textPrimary}>{ordering.length}</b> product{ordering.length === 1 ? "" : "s"} · about <b className={`tabular-nums ${t.textPrimary}`}>{fmt(total)}</b></>
                : "Nothing needs buying right now."}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={t.textMuted}><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          <div className={`rounded-2xl p-3 ${t.insetBg}`}>
            <button type="button" onClick={() => setShowPrefs((v) => !v)} className="w-full flex items-center gap-2 text-left">
              <Settings2 className={`w-4 h-4 ${t.textMuted}`} />
              <span className={`flex-1 text-sm ${t.textSecondary}`}>
                Orders take <b className={t.textPrimary}>{prefs.leadDays} day{prefs.leadDays === 1 ? "" : "s"}</b> · buy enough for <b className={t.textPrimary}>{prefs.coverDays} days</b>
                {prefs.budget ? <> · budget <b className={t.textPrimary}>{fmt(prefs.budget)}</b></> : null}
              </span>
              <ChevronDown className={`w-4 h-4 ${t.textMuted} ${showPrefs ? "rotate-180" : ""}`} />
            </button>
            {showPrefs && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                <label className={`text-xs ${t.textMuted}`}>Days to arrive
                  <input inputMode="numeric" value={prefs.leadDays} onChange={(e) => setPref({ leadDays: e.target.value })} className={`w-full rounded-xl px-3 py-2 text-sm mt-1 ${t.inputBg}`} />
                </label>
                <label className={`text-xs ${t.textMuted}`}>Days to last
                  <input inputMode="numeric" value={prefs.coverDays} onChange={(e) => setPref({ coverDays: e.target.value })} className={`w-full rounded-xl px-3 py-2 text-sm mt-1 ${t.inputBg}`} />
                </label>
                <label className={`text-xs ${t.textMuted}`}>Budget (optional)
                  <MoneyInput value={prefs.budget ?? ""} onChange={(v) => setPref({ budget: v === "" ? null : Number(v) })} placeholder="No limit"
                    className={`w-full rounded-xl px-3 py-2 text-sm mt-1 tabular-nums ${t.inputBg}`} />
                </label>
              </div>
            )}
          </div>

          {done && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-emerald-500 font-semibold">✓ {done.added} product{done.added === 1 ? "" : "s"} added to stock</span>
              <button type="button" onClick={undo} className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full ${t.pillBg}`}><Undo2 className="w-3.5 h-3.5" /> Undo</button>
            </div>
          )}

          {plan.lines.length === 0 && (
            <div className="text-center py-8">
              <PackageCheck className="w-10 h-10 mx-auto text-emerald-500" />
              <p className={`mt-2 font-semibold ${t.textPrimary}`}>Your shelves are fine.</p>
              <p className={`text-sm ${t.textMuted}`}>Nothing is running out at the rate things are selling.</p>
            </div>
          )}

          {SECTIONS.map((sec) => {
            const items = plan.lines.filter((l) => l.status === sec.status);
            if (!items.length) return null;
            return (
              <section key={sec.status}>
                <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${sec.tone || t.textMuted}`}>{sec.title} ({items.length})</h3>
                <ul className="space-y-2">
                  {items.map((l) => (
                    <li key={l.id} className={`rounded-2xl border p-3 ${t.divider} ${q(l) === 0 ? "opacity-60" : ""}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-semibold ${t.textPrimary}`}>{l.name}</div>
                          <div className={`text-xs ${t.textMuted}`}>
                            {l.stock} left{l.perWeek > 0 ? ` · sells about ${l.perWeek} a week` : ""}
                          </div>
                          <div className={`text-xs ${t.textSecondary}`}>{l.reason}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Stepper t={t} value={q(l)} onChange={(v) => setQty((cur) => ({ ...base, ...cur, [l.id]: v }))} />
                          <span className={`text-xs tabular-nums ${t.textMuted}`}>{l.cost > 0 ? fmt(q(l) * l.cost) : "no cost price"}</span>
                        </div>
                      </div>
                      {receiving && q(l) > 0 && (
                        <label className={`flex items-center gap-2 text-xs mt-2 ${t.textMuted}`}>
                          Cost each this time
                          <MoneyInput value={costs[l.id] ?? l.cost ?? ""} onChange={(v) => setCosts((c) => ({ ...c, [l.id]: v === "" ? null : Number(v) }))}
                            className={`w-28 rounded-lg px-2 py-1 text-sm tabular-nums ${t.inputBg}`} />
                        </label>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {plan.idle.length > 0 && (
            <section>
              <button type="button" onClick={() => setShowIdle((v) => !v)} className="w-full flex items-center gap-2 text-left mb-2">
                <h3 className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>Not selling ({plan.idle.length}) · {fmt(plan.idleValue)} on the shelf</h3>
                <ChevronDown className={`w-4 h-4 ml-auto ${t.textMuted} ${showIdle ? "rotate-180" : ""}`} />
              </button>
              {showIdle && (
                <>
                  <p className={`text-xs mb-2 ${t.textMuted}`}>No sales in 60 days. Don't buy more of these; a discount could turn them back into cash.</p>
                  <ul className={`rounded-2xl border divide-y ${t.divider}`}>
                    {plan.idle.map((x) => (
                      <li key={x.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className={`flex-1 min-w-0 truncate ${t.textPrimary}`}>{x.name}</span>
                        <span className={`text-xs ${t.textMuted}`}>{x.stock} · {x.neverSold ? "never sold" : `last sold ${x.days} days ago`}</span>
                        <span className={`text-xs tabular-nums ${t.textSecondary}`}>{fmt(x.value)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </div>

        {ordering.length > 0 && (
          <div className={`shrink-0 px-4 pb-4 pt-3 border-t ${t.divider}`}>
            {receiving ? (
              <>
                <p className={`text-xs mb-2 ${t.textMuted}`}>Check the quantities that actually arrived (and the cost each, if it changed), then add them.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setReceiving(false)} className={`px-4 py-3 rounded-2xl text-sm font-semibold ${t.pillBg}`}>Back</button>
                  <button type="button" onClick={receive} className="flex-1 py-3 rounded-2xl text-sm font-semibold bg-emerald-500 text-white flex items-center justify-center gap-2">
                    <PackageCheck className="w-4 h-4" /> Add to stock
                  </button>
                </div>
              </>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={send} className="flex-1 py-3 rounded-2xl text-sm font-semibold bg-emerald-500 text-white flex items-center justify-center gap-2">
                  <MessageCircle className="w-4 h-4" /> Send to supplier
                </button>
                <button type="button" onClick={() => setReceiving(true)} className={`flex-1 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}>
                  <PackageCheck className="w-4 h-4" /> Goods arrived
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
