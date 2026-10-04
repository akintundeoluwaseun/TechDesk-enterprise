import React, { useEffect, useRef, useState } from "react";
import { Mic, X, Check, Wifi, Undo2, AlertTriangle, Loader2, Square } from "lucide-react";
import { voiceOrder, VOICE_PAYMENT_METHODS, featureOn } from "@techdesk/core";
import { useThemeTokens } from "../lib/ThemeContext";
import { SITE_ORIGIN } from "@techdesk/editions";
import { useAuth, canAccess } from "../lib/AuthContext";
import { useSettings } from "../lib/SettingsContext";
import { money } from "../lib/currency";
import { toast } from "../lib/toast";
import { canRecord, startRecording, blobToWavBase64, MAX_SECONDS } from "../lib/voiceRecorder";

// Voice orders: hold the mic, say what happened, check it, save it.
//
// Online only. The button checks for a real connection before it records
// anything; offline, it says so and records nothing. Nothing is saved until
// the person ticks the actions and taps Save, and Undo is there for 10
// seconds after.

export const VOICE_SAVED_EVENT = "techdesk:voice-saved";

const PAGE_FOR = { sale: "/sales", payment: "/sales", repair: "/repairs", repair_status: "/repairs", stock: "/inventory" };
const TITLE = { sale: "Sale", repair: "New repair", stock: "Stock", repair_status: "Repair status", payment: "Payment", question: "Question", unknown: "Not understood" };

function Sheet({ children, onClose, t, label }) {
  return (
    <div className="td-overlay fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" role="dialog" aria-modal="true" aria-label={label}>
      <div className={`w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 ${t.cardBg}`}>
        <div className="flex justify-end -mb-2">
          <button type="button" onClick={onClose} className={t.textMuted} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Picker({ value, options, onChange, t, placeholder }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={`w-full rounded-xl px-3 py-2 text-sm mt-1 ${t.inputBg}`}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function NumberField({ label, value, onChange, t }) {
  return (
    <label className={`text-xs ${t.textMuted} flex-1 min-w-[90px]`}>
      {label}
      <input
        type="number"
        inputMode="decimal"
        min="0"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={`w-full rounded-xl px-3 py-2 text-sm mt-1 ${t.inputBg}`}
      />
    </label>
  );
}

function TextField({ label, value, onChange, t }) {
  return (
    <label className={`text-xs ${t.textMuted} flex-1 min-w-[140px]`}>
      {label}
      <input value={value || ""} onChange={(e) => onChange(e.target.value)} className={`w-full rounded-xl px-3 py-2 text-sm mt-1 ${t.inputBg}`} />
    </label>
  );
}

function DraftCard({ d, update, settings, t, allowed }) {
  const problems = voiceOrder.issues(d);
  const set = (patch) => update({ ...d, ...patch });
  const ready = problems.length === 0;
  const can = allowed(d.type);
  const fmt = (n) => money(n || 0, settings);

  const customerPicker = (field = "customer") =>
    !d[field].id && d[field].candidates.length > 0 && (
      <Picker
        t={t}
        value=""
        placeholder={`Which ${d[field].name}?`}
        options={[
          ...d[field].candidates.map((c) => ({ value: c.id, label: `${c.name}${c.phone ? ` · ${c.phone}` : ""}` })),
          { value: "__new", label: `A new customer called ${d[field].name}` },
        ]}
        onChange={(v) => {
          if (v === "__new") set({ [field]: { ...d[field], candidates: [] } });
          else {
            const c = d[field].candidates.find((x) => x.id === v);
            if (c) set({ [field]: { id: c.id, name: c.name, phone: c.phone, candidates: [] } });
          }
        }}
      />
    );

  let body = null;
  if (d.type === "sale") {
    body = (
      <>
        <p className={`text-sm ${t.textSecondary}`}>{d.customer.name || "Walk-in"}</p>
        {customerPicker()}
        {d.items.map((it, idx) => {
          const setItem = (patch) => set({ items: d.items.map((x, j) => (j === idx ? { ...x, ...patch } : x)) });
          return (
            <div key={idx} className={`mt-2 rounded-xl p-2 ${t.insetBg}`}>
              <div className={`text-sm font-medium ${t.textPrimary}`}>{it.productId ? it.name : `"${it.said}"`}</div>
              {!it.productId && (
                <Picker
                  t={t}
                  value=""
                  placeholder={it.candidates.length ? "Which product?" : "Not in your stock. Pick a product"}
                  options={(it.candidates.length ? it.candidates : []).map((c) => ({ value: c.id, label: `${c.name} · ${fmt(c.price)} · ${c.stock} left` }))}
                  onChange={(v) => {
                    const c = it.candidates.find((x) => x.id === v);
                    if (c) setItem({ productId: c.id, name: c.name, price: it.price != null ? it.price : Number(c.price) || 0, stock: Number(c.stock || 0), costPrice: Number(c.costPrice || 0), candidates: [] });
                  }}
                />
              )}
              <div className="flex gap-2 mt-1">
                <NumberField t={t} label="Qty" value={it.qty} onChange={(v) => setItem({ qty: Math.max(1, Math.round(v || 1)) })} />
                <NumberField t={t} label="Price each" value={it.price} onChange={(v) => setItem({ price: v })} />
              </div>
            </div>
          );
        })}
        <div className="flex gap-2 mt-2 items-end flex-wrap">
          <label className={`text-xs ${t.textMuted} flex-1 min-w-[140px]`}>
            Payment
            <select value={d.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })} className={`w-full rounded-xl px-3 py-2 text-sm mt-1 ${t.inputBg}`}>
              {VOICE_PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <NumberField t={t} label="Amount paid (empty = all)" value={d.amountPaid} onChange={(v) => set({ amountPaid: v })} />
        </div>
        <p className={`text-sm font-semibold mt-2 ${t.textPrimary}`}>Total {fmt(voiceOrder.saleTotal(d))}</p>
      </>
    );
  } else if (d.type === "repair") {
    body = (
      <>
        {customerPicker()}
        <div className="flex gap-2 flex-wrap">
          <TextField t={t} label="Customer" value={d.customer.name} onChange={(v) => set({ customer: { ...d.customer, name: v } })} />
          <TextField t={t} label="Phone" value={d.customer.phone} onChange={(v) => set({ customer: { ...d.customer, phone: v } })} />
        </div>
        <div className="flex gap-2 flex-wrap mt-1">
          <TextField t={t} label="Device" value={d.device} onChange={(v) => set({ device: v })} />
          <NumberField t={t} label="Cost" value={d.cost} onChange={(v) => set({ cost: v })} />
        </div>
        <TextField t={t} label="Fault" value={d.problem} onChange={(v) => set({ problem: v })} />
      </>
    );
  } else if (d.type === "stock") {
    body = (
      <>
        <p className={`text-sm font-medium ${t.textPrimary}`}>{d.productId ? d.name : `New product: ${d.name}`}</p>
        {!d.productId && d.candidates.length > 0 && (
          <Picker
            t={t}
            value=""
            placeholder="Is it one of these?"
            options={[...d.candidates.map((c) => ({ value: c.id, label: c.name })), { value: "__new", label: `No, it's a new product` }]}
            onChange={(v) => (v === "__new" ? set({ candidates: [] }) : set({ productId: v, name: d.candidates.find((c) => c.id === v)?.name, candidates: [] }))}
          />
        )}
        <div className="flex gap-2 mt-1 flex-wrap">
          <NumberField t={t} label="Add" value={d.qty} onChange={(v) => set({ qty: Math.max(1, Math.round(v || 1)) })} />
          <NumberField t={t} label="Cost each" value={d.costPrice} onChange={(v) => set({ costPrice: v })} />
          <NumberField t={t} label="Selling price" value={d.price} onChange={(v) => set({ price: v })} />
        </div>
      </>
    );
  } else if (d.type === "repair_status") {
    body = (
      <>
        <p className={`text-sm ${t.textSecondary}`}>{d.label || "Which repair?"}</p>
        {!d.repairId && d.candidates.length > 0 && (
          <Picker t={t} value="" placeholder="Which repair?" options={d.candidates.map((c) => ({ value: c.id, label: c.label }))}
            onChange={(v) => set({ repairId: v, label: d.candidates.find((c) => c.id === v)?.label, candidates: [] })} />
        )}
        <label className={`text-xs ${t.textMuted}`}>
          New status
          <select value={d.status || ""} onChange={(e) => set({ status: e.target.value || null })} className={`w-full rounded-xl px-3 py-2 text-sm mt-1 ${t.inputBg}`}>
            <option value="">Choose…</option>
            {["received", "in progress", "awaiting parts", "completed", "delivered"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </>
    );
  } else if (d.type === "payment") {
    body = (
      <>
        <p className={`text-sm ${t.textSecondary}`}>{d.customerName}{d.target ? ` · ${d.target.label} (owes ${fmt(d.target.owed)})` : ""}</p>
        {!d.target && d.candidates.length > 0 && (
          <Picker t={t} value="" placeholder="Which one is being paid?" options={d.candidates.map((c, i) => ({ value: String(i), label: `${c.label} · owes ${fmt(c.owed)}` }))}
            onChange={(v) => v !== "" && set({ target: d.candidates[Number(v)], amount: d.amount ?? d.candidates[Number(v)].owed })} />
        )}
        <NumberField t={t} label="Amount paid" value={d.amount} onChange={(v) => set({ amount: v })} />
      </>
    );
  } else {
    body = <p className={`text-sm ${t.textSecondary}`}>{d.note || "This part couldn't be turned into an action."}</p>;
  }

  const actionable = !["question", "unknown"].includes(d.type);
  return (
    <div className={`rounded-2xl p-3 border ${ready && d.include ? "border-emerald-500/40" : t.divider} ${d.include ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-2 mb-1">
        {actionable && (
          <input type="checkbox" checked={d.include && can} disabled={!can} onChange={(e) => set({ include: e.target.checked })}
            className="w-5 h-5 accent-emerald-500" aria-label={`Include ${TITLE[d.type]}`} />
        )}
        <span className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>{TITLE[d.type] || d.type}</span>
        {ready && actionable && can && <Check className="w-4 h-4 text-emerald-500" />}
      </div>
      {body}
      {!can && actionable && <p className="text-xs text-amber-500 mt-2">You don't have access to this page, so this can't be saved from your device.</p>}
      {actionable && d.note && problems.length > 0 && <p className={`text-xs mt-2 ${t.textMuted}`}>Heard: {d.note}</p>}
      {actionable && can && problems.map((p) => (
        <p key={p} className="text-xs text-amber-500 mt-1 flex gap-1 items-start"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{p}</p>
      ))}
    </div>
  );
}

export default function VoiceOrder() {
  const t = useThemeTokens();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [phase, setPhase] = useState("idle"); // idle | checking | offline | consent | recording | sending | review | error
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [undo, setUndo] = useState(null);
  const rec = useRef(null);
  const timer = useRef(null);
  const pressedAt = useRef(0);
  const toggleMode = useRef(false);
  const [tapMode, setTapMode] = useState(false);

  useEffect(() => () => { clearInterval(timer.current); rec.current?.cancel(); }, []);
  useEffect(() => {
    if (!undo) return undefined;
    const id = setTimeout(() => setUndo(null), 10000);
    return () => clearTimeout(id);
  }, [undo]);

  if (!featureOn("ai") || !canRecord()) return null;

  const allowed = (type) => !PAGE_FOR[type] || canAccess(user, PAGE_FOR[type]);

  async function begin() {
    setError("");
    setPhase("checking");
    if (!(await voiceOrder.isOnline())) {
      setPhase("offline");
      return false;
    }
    if (!voiceOrder.hasVoiceConsent()) {
      setPhase("consent");
      return false;
    }
    try {
      rec.current = await startRecording();
    } catch {
      setError("TechDesk couldn't use the microphone. Allow microphone access for TechDesk in your phone or computer settings, then try again.");
      setPhase("error");
      return false;
    }
    setSeconds(0);
    setPhase("recording");
    const started = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) finish();
    }, 250);
    return true;
  }

  async function finish() {
    clearInterval(timer.current);
    const r = rec.current;
    rec.current = null;
    toggleMode.current = false;
    setTapMode(false);
    if (!r) return;
    setPhase("sending");
    try {
      const blob = await r.stop();
      const { audio, seconds: len } = await blobToWavBase64(blob);
      if (len < 0.8) {
        setPhase("idle");
        toast({ title: "Hold the button while you speak", tone: "info" });
        return;
      }
      const res = await voiceOrder.send({ audio, mime: "audio/wav" });
      if (!res.ok) {
        setError(res.message);
        setPhase(res.error === "offline" ? "offline" : "error");
        return;
      }
      setResult(res);
      setDrafts(voiceOrder.resolve(res.actions).map((d) => (allowed(d.type) ? d : { ...d, include: false })));
      setPhase("review");
    } catch {
      setError("Couldn't read that recording. Try again.");
      setPhase("error");
    }
  }

  function cancelRecording() {
    clearInterval(timer.current);
    rec.current?.cancel();
    rec.current = null;
    toggleMode.current = false;
    setTapMode(false);
    setPhase("idle");
  }

  async function onPointerDown(e) {
    e.preventDefault();
    if (phase === "recording") return finish();
    if (phase !== "idle") return undefined;
    pressedAt.current = Date.now();
    toggleMode.current = false;
    const started = await begin();
    // Let go before recording even started: treat it as a tap, and keep
    // recording until the next tap.
    if (started && !pressedAt.current) {
      toggleMode.current = true;
      setTapMode(true);
    }
    return undefined;
  }

  function onPointerUp() {
    const held = Date.now() - pressedAt.current;
    pressedAt.current = 0;
    if (phase !== "recording" || toggleMode.current) return;
    if (held < 400) {
      toggleMode.current = true; // a quick tap: keep recording until tapped again
      setTapMode(true);
      return;
    }
    finish();
  }

  function save() {
    const out = voiceOrder.apply(drafts.filter((d) => allowed(d.type)), { actor: user?.name });
    setPhase("idle");
    setDrafts([]);
    if (out.saved) {
      setUndo(out.undo);
      window.dispatchEvent(new CustomEvent(VOICE_SAVED_EVENT));
    }
  }

  function doUndo() {
    voiceOrder.runUndo(undo);
    setUndo(null);
    window.dispatchEvent(new CustomEvent(VOICE_SAVED_EVENT));
    toast({ title: "Undone", tone: "info" });
  }

  const ready = drafts.filter((d) => d.include && allowed(d.type) && voiceOrder.issues(d).length === 0);
  const blocked = drafts.filter((d) => d.include && voiceOrder.issues(d).length > 0);

  return (
    <>
      <button
        type="button"
        data-tour="voice-order"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={phase === "recording" ? "Stop recording" : "Voice order: hold to talk"}
        className={`fixed right-4 bottom-20 md:bottom-6 z-[45] w-14 h-14 rounded-full shadow-xl flex items-center justify-center select-none touch-none transition-transform active:scale-95 ${
          phase === "recording" ? "bg-red-500 text-white animate-pulse" : "bg-gradient-to-br from-indigo-600 to-sky-500 text-white"
        }`}
      >
        {phase === "sending" || phase === "checking" ? <Loader2 className="w-6 h-6 animate-spin" /> : phase === "recording" ? <Square className="w-5 h-5" /> : <Mic className="w-6 h-6" />}
      </button>

      {phase === "recording" && (
        <div className="fixed right-20 bottom-[5.6rem] md:bottom-9 z-[45] rounded-full bg-neutral-900/95 text-white text-sm px-4 py-2 shadow-lg flex items-center gap-3" role="status">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          {tapMode ? "Listening… tap to finish" : "Listening… let go to send"} · {seconds}s
          <button type="button" onClick={cancelRecording} className="underline underline-offset-2">Cancel</button>
        </div>
      )}
      {phase === "sending" && (
        <div className="fixed right-20 bottom-[5.6rem] md:bottom-9 z-[45] rounded-full bg-neutral-900/95 text-white text-sm px-4 py-2 shadow-lg" role="status">
          Working it out…
        </div>
      )}

      {phase === "offline" && (
        <Sheet t={t} onClose={() => setPhase("idle")} label="No internet">
          <div className="text-center py-2">
            <Wifi className={`w-10 h-10 mx-auto mb-3 ${t.textMuted}`} />
            <h2 className={`text-lg font-bold mb-1 ${t.textPrimary}`}>Connect to the internet</h2>
            <p className={`text-sm mb-5 ${t.textSecondary}`}>Voice orders need the internet. Everything else in TechDesk keeps working offline.</p>
            <button type="button" onClick={() => begin()} className={`w-full py-3 rounded-xl font-semibold ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}>Try again</button>
          </div>
        </Sheet>
      )}

      {phase === "consent" && (
        <Sheet t={t} onClose={() => setPhase("idle")} label="About voice orders">
          <h2 className={`text-lg font-bold mb-2 ${t.textPrimary}`}>Voice orders</h2>
          <ul className={`text-sm space-y-2 mb-4 ${t.textSecondary}`}>
            <li>• Hold the mic and say what happened: <i>“Sell two chargers to Chidi, he paid transfer. Add ten iPhone 11 batteries.”</i></li>
            <li>• You check everything before it's saved. Nothing is saved on its own.</li>
            <li>• Hold the button while you talk and let go to send, or tap once to start and again to finish.</li>
            <li>• Your voice note and your product names are sent to Google's Gemini AI to understand them. Google may use them to improve its products. Your customers, prices and sales are not sent. <a href={`${SITE_ORIGIN}/privacy`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Privacy policy</a></li>
          </ul>
          <button type="button" onClick={() => { voiceOrder.giveVoiceConsent(); setPhase("idle"); }}
            className={`w-full py-3 rounded-xl font-semibold ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}>
            I understand, turn it on
          </button>
          <button type="button" onClick={() => setPhase("idle")} className={`w-full py-2 mt-2 text-sm ${t.textMuted}`}>Not now</button>
        </Sheet>
      )}

      {phase === "error" && (
        <Sheet t={t} onClose={() => setPhase("idle")} label="Voice order problem">
          <h2 className={`text-lg font-bold mb-2 ${t.textPrimary}`}>That didn't work</h2>
          <p className={`text-sm mb-4 ${t.textSecondary}`}>{error}</p>
          <button type="button" onClick={() => setPhase("idle")} className={`w-full py-3 rounded-xl font-semibold ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}>OK</button>
        </Sheet>
      )}

      {phase === "review" && (
        <Sheet t={t} onClose={() => { setPhase("idle"); setDrafts([]); }} label="Check before saving">
          <h2 className={`text-lg font-bold ${t.textPrimary}`}>Check before saving</h2>
          {result?.transcript && <p className={`text-xs mt-1 mb-3 italic ${t.textMuted}`}>“{result.transcript}”</p>}
          <div className="space-y-3">
            {drafts.length === 0 && <p className={`text-sm ${t.textSecondary}`}>Nothing to save was heard. Try again, and say it like “sell two chargers to Chidi”.</p>}
            {drafts.map((d, i) => (
              <DraftCard key={d.id} d={d} t={t} settings={settings} allowed={allowed} update={(nd) => setDrafts(drafts.map((x, j) => (j === i ? nd : x)))} />
            ))}
          </div>
          {blocked.length > 0 && <p className="text-xs text-amber-500 mt-3">Fix the yellow notes, or untick those actions, to save.</p>}
          <button type="button" disabled={!ready.length || blocked.length > 0} onClick={save}
            className={`w-full py-3 rounded-xl font-semibold mt-4 disabled:opacity-40 ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}>
            {ready.length ? `Save ${ready.length} ${ready.length === 1 ? "action" : "actions"}` : "Nothing ready to save"}
          </button>
          {typeof result?.left === "number" && <p className={`text-xs text-center mt-2 ${t.textMuted}`}>{Math.max(0, result.left)} voice orders left today on this device</p>}
        </Sheet>
      )}

      {undo && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-8 z-[75] rounded-full bg-neutral-900/95 text-white text-sm pl-4 pr-2 py-2 shadow-xl flex items-center gap-3" role="status">
          Saved by voice
          <button type="button" onClick={doUndo} className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 font-semibold">
            <Undo2 className="w-4 h-4" /> Undo
          </button>
        </div>
      )}
    </>
  );
}
