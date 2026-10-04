import React, { useEffect, useRef, useState } from "react";
import { Mic, X, Check, Wifi, Undo2, AlertTriangle, Loader2, Square, Send, Sparkles, Camera, ImagePlus, NotebookPen } from "lucide-react";
import { voiceOrder, VOICE_PAYMENT_METHODS, featureOn } from "@techdesk/core";
import { useThemeTokens } from "../lib/ThemeContext";
import { SITE_ORIGIN } from "@techdesk/editions";
import { useAuth, canAccess } from "../lib/AuthContext";
import { useSettings } from "../lib/SettingsContext";
import { money } from "../lib/currency";
import { toast } from "../lib/toast";
import { db } from "../lib/db";
import { canRecord, startRecording, blobToWavBase64, MAX_SECONDS } from "../lib/voiceRecorder";
import { preparePhoto } from "../lib/photoPrep";

// Voice orders: hold the mic, say what happened, check it, save it.
//
// Online only. The button checks for a real connection before it records
// anything; offline, it says so and records nothing. Nothing is saved until
// the person ticks the actions and taps Save, and Undo is there for 10
// seconds after.
//
// The camera button reads a page of the shop's old paper notebook the same
// way: each line becomes a card with the date written on the page.

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

function AnswerCard({ a, t, settings }) {
  return (
    <div className={`rounded-2xl p-3 ${t.insetBg}`}>
      <div className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>{a.title}</div>
      {a.lines.length === 0 && <p className={`text-sm mt-1 whitespace-pre-line ${t.textSecondary}`}>{a.empty}</p>}
      <div className="mt-1 divide-y divide-neutral-500/15">
        {a.lines.map((l, i) => (
          <div key={i} className="flex justify-between gap-3 py-1.5 text-sm">
            <span className={`min-w-0 ${t.textSecondary}`}>{l.label}</span>
            <span className={`font-semibold tabular-nums shrink-0 ${t.textPrimary}`}>{l.money ? money(l.value, settings) : l.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DraftCard({ d, update, settings, t, allowed, practice }) {
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

  const today = voiceOrder.localDay();
  const dateField = (d.source === "photo" || d.date) && ["sale", "repair"].includes(d.type) && (
    <label className={`text-xs ${t.textMuted} block mb-1`}>
      Date
      <input type="date" max={today} value={d.date || today} onChange={(e) => set({ date: e.target.value && e.target.value <= today ? e.target.value : today })}
        className={`w-full rounded-xl px-3 py-2 text-sm mt-1 ${t.inputBg}`} />
    </label>
  );

  let body = null;
  if (d.type === "sale") {
    body = (
      <>
        {dateField}
        <p className={`text-sm ${t.textSecondary}`}>{d.customer.name || "Walk-in"}</p>
        {customerPicker()}
        {d.items.map((it, idx) => {
          const setItem = (patch) => set({ items: d.items.map((x, j) => (j === idx ? { ...x, ...patch } : x)) });
          return (
            <div key={idx} className={`mt-2 rounded-xl p-2 ${t.insetBg}`}>
              <div className={`text-sm font-medium ${t.textPrimary}`}>{it.productId ? it.name : `"${it.said}"`}</div>
              {!it.productId && it.oneOff && (
                <p className={`text-xs ${t.textMuted}`}>Not in your stock: sold as a one-off item. Stock isn't changed.</p>
              )}
              {!it.productId && (
                <Picker
                  t={t}
                  value=""
                  placeholder={it.oneOff ? "Or pick one of your products…" : "Which product?"}
                  options={[
                    ...it.candidates.map((c) => ({ value: c.id, label: `${c.name} · ${fmt(c.price)} · ${c.stock} left` })),
                    ...(it.oneOff ? [] : [{ value: "__oneoff", label: `Sell "${it.said}" as a one-off item` }]),
                  ]}
                  onChange={(v) => {
                    if (v === "__oneoff") return setItem({ oneOff: true });
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
        {d.source === "photo" && d.items.some((i) => i.productId) && (
          <label className={`flex items-start gap-2 text-xs mt-2 ${t.textSecondary}`}>
            <input type="checkbox" checked={d.takeFromStock !== false} onChange={(e) => set({ takeFromStock: e.target.checked })} className="w-4 h-4 mt-px accent-emerald-500" />
            <span>Also take these from my stock now. Leave this off for old sales: your stock count already left them out.</span>
          </label>
        )}
      </>
    );
  } else if (d.type === "repair") {
    body = (
      <>
        {dateField}
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
        {d.source === "photo" && (
          <label className={`text-xs ${t.textMuted} block mt-1`}>
            Status
            <select value={d.status || "received"} onChange={(e) => set({ status: e.target.value })} className={`w-full rounded-xl px-3 py-2 text-sm mt-1 ${t.inputBg}`}>
              {["received", "in progress", "awaiting parts", "completed", "delivered"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
        )}
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
        {d.productId && d.source === "photo" && (
          <select value={d.mode || "add"} onChange={(e) => set({ mode: e.target.value })} aria-label="Add or set"
            className={`w-full rounded-xl px-3 py-2 text-sm mt-1 ${t.inputBg}`}>
            <option value="add">Goods came in: add to my stock</option>
            <option value="set">A count of my shelf: set my stock to this</option>
          </select>
        )}
        <div className="flex gap-2 mt-1 flex-wrap">
          <NumberField t={t} label={d.mode === "set" ? "Set to" : "Add"} value={d.qty}
            onChange={(v) => set({ qty: d.mode === "set" ? Math.max(0, Math.round(v || 0)) : Math.max(1, Math.round(v || 1)) })} />
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
  } else if (d.question && d.answer) {
    return <AnswerCard a={d.answer} t={t} settings={settings} />;
  } else {
    body = <p className={`text-sm ${t.textSecondary}`}>{d.note || "This part couldn't be turned into an action."}</p>;
  }

  const actionable = !["question", "unknown"].includes(d.type);
  return (
    <div className={`rounded-2xl p-3 border ${ready && d.include ? "border-emerald-500/40" : t.divider} ${d.include ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-2 mb-1">
        {actionable && !practice && (
          <input type="checkbox" checked={d.include && can} disabled={!can} onChange={(e) => set({ include: e.target.checked })}
            className="w-5 h-5 accent-emerald-500" aria-label={`Include ${TITLE[d.type]}`} />
        )}
        <span className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>{TITLE[d.type] || d.type}</span>
        {d.source === "photo" && d.date && d.date !== today && <span className={`text-xs ${t.textMuted}`}>· {new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>}
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

// ------------------------------------------------------------- practice --
const TIPS = [
  "Say the customer's name and how many: “two chargers to Chidi”.",
  "Say how they paid: cash, transfer or POS. If they still owe, say how much they paid.",
  "Use your product names the way they're written in your stock.",
  "Say amounts plainly: “eighteen thousand” or “18k”.",
  "Several things at once? Pause and say “then” between them.",
  "Hold the phone close and speak a little slower than normal.",
];

function practiceLessons(inventory, customers) {
  const p1 = inventory[0]?.name || "screen guard";
  const p2 = inventory[1]?.name || inventory[0]?.name || "phone charger";
  const c1 = (customers[0]?.name || "Chidi").split(" ")[0];
  const c2 = (customers[1]?.name || "Aisha").split(" ")[0];
  return [
    { title: "Make a sale", say: `Sell two ${p1} to ${c1}, he paid by transfer.`, expect: ["sale"] },
    { title: "Add stock", say: `Add ten ${p2}, I bought them for eleven thousand each.`, expect: ["stock"] },
    { title: "Book a repair", say: `New repair for ${c2}, Samsung A54 not charging, fifteen thousand.`, expect: ["repair"] },
    { title: "Ask a question", say: "How much did I sell today?", expect: ["question"] },
    { title: "Two things at once", say: `Sell one ${p1} to ${c1} cash, then add five ${p2}.`, expect: ["sale", "stock"] },
  ];
}

const EXAMPLES = ["How much did I sell today?", "Who owes me?", "What's running low?", "Which repairs are ready but not collected?"];

let msgSeq = 0;
const mid = () => `m${Date.now().toString(36)}${(msgSeq++).toString(36)}`;

export default function VoiceOrder() {
  const t = useThemeTokens();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(null); // null | offline | consent | error
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false); // sending to the server
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [tapMode, setTapMode] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [practice, setPractice] = useState(null); // null | {step, results}
  const [left, setLeft] = useState(null);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [busyText, setBusyText] = useState("");
  const camInput = useRef(null);
  const pickInput = useRef(null);
  const rec = useRef(null);
  const timer = useRef(null);
  const holdTimer = useRef(null);
  const pressedAt = useRef(0);
  const afterConsent = useRef(null);
  const listEnd = useRef(null);

  useEffect(() => () => { clearInterval(timer.current); clearTimeout(holdTimer.current); rec.current?.cancel(); }, []);
  useEffect(() => {
    // A page read from a photo can be a dozen cards: start at the top of them, where the "check each one" note is.
    const last = messages[messages.length - 1];
    const el = last?.photo && last.kind === "drafts" && !last.saved ? document.querySelector(`[data-msg="${last.id}"]`) : null;
    (el || listEnd.current)?.scrollIntoView?.({ block: el ? "start" : "end" });
  }, [messages.length, busy, practice]);

  if (!featureOn("ai")) return null;
  const micOk = canRecord();
  const allowed = (type) => !PAGE_FOR[type] || canAccess(user, PAGE_FOR[type]);
  const say = (m) => setMessages((list) => [...list, { id: mid(), ...m }]);
  const updateMsg = (id, patch) => setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  /** Online and agreed to the notice; otherwise shows why and remembers what to do next. */
  async function ready(next) {
    if (!(await voiceOrder.isOnline())) {
      afterConsent.current = null;
      setSheet("offline");
      return false;
    }
    if (!voiceOrder.hasVoiceConsent()) {
      afterConsent.current = next;
      setSheet("consent");
      return false;
    }
    return true;
  }

  async function handleResult(res, { practiceStep, source } = {}) {
    if (!res.ok) {
      say({ role: "assistant", kind: "error", text: res.message });
      if (res.error === "offline") setSheet("offline");
      return;
    }
    if (typeof res.left === "number") setLeft(res.left);
    if (res.transcript && source !== "photo") say({ role: "user", text: res.transcript, heard: true });
    const drafts = voiceOrder.resolve(res.actions, {}, { source }).map((d) => (allowed(d.type) ? d : { ...d, include: false }));
    if (practiceStep != null) {
      const lesson = practice?.lessons?.[practiceStep];
      const got = drafts.map((d) => d.type);
      const passed = lesson ? lesson.expect.every((e) => got.includes(e)) : false;
      setPractice((p) => p && { ...p, results: { ...p.results, [practiceStep]: passed } });
      say({ role: "assistant", kind: "drafts", drafts, practice: true, passed });
      return;
    }
    if (source === "photo") {
      const usable = drafts.filter((d) => d.type !== "unknown").length;
      if (!usable) {
        say({ role: "assistant", kind: "error", text: "I couldn't read any sales, repairs or stock on that page. Lay it flat in good light, fill the photo with one page, and try again." });
        return;
      }
      say({ role: "assistant", kind: "drafts", drafts, photo: true, pageText: res.transcript || "" });
      return;
    }
    if (!drafts.length) {
      say({ role: "assistant", kind: "error", text: "I didn't catch anything to do. Try “Sell two chargers to Chidi” or “Who owes me?”." });
      return;
    }
    say({ role: "assistant", kind: "drafts", drafts });
  }

  async function sendText(text, opts) {
    const clean = String(text || "").trim();
    if (!clean || busy) return;
    if (!(await ready(() => sendText(clean, opts)))) return;
    setInput("");
    say({ role: "user", text: clean });
    setBusy(true);
    try {
      const res = await voiceOrder.send({ text: clean });
      await handleResult({ ...res, transcript: "" }, opts);
    } finally {
      setBusy(false);
    }
  }

  async function startRec() {
    if (!(await ready(() => startRec()))) return false;
    try {
      rec.current = await startRecording();
    } catch {
      setError("TechDesk couldn't use the microphone. Allow microphone access for TechDesk in your phone or computer settings, then try again.");
      setSheet("error");
      return false;
    }
    setSeconds(0);
    setRecording(true);
    const started = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) stopRec();
    }, 250);
    return true;
  }

  async function stopRec() {
    clearInterval(timer.current);
    const r = rec.current;
    rec.current = null;
    setRecording(false);
    setTapMode(false);
    if (!r) return;
    setBusy(true);
    try {
      const blob = await r.stop();
      const { audio, seconds: len } = await blobToWavBase64(blob);
      if (len < 0.8) {
        say({ role: "assistant", kind: "error", text: "That was too short. Hold the mic while you speak, or tap once to start and again to finish." });
        return;
      }
      const res = await voiceOrder.send({ audio, mime: "audio/wav" });
      await handleResult(res, practice ? { practiceStep: practice.step } : undefined);
    } catch {
      say({ role: "assistant", kind: "error", text: "Couldn't read that recording. Try again." });
    } finally {
      setBusy(false);
    }
  }

  function cancelRec() {
    clearInterval(timer.current);
    rec.current?.cancel();
    rec.current = null;
    setRecording(false);
    setTapMode(false);
  }

  // The mic: hold to talk, or tap once to start and again to finish.
  async function micDown(e) {
    e.preventDefault();
    if (recording) return stopRec();
    if (busy) return undefined;
    pressedAt.current = Date.now();
    const started = await startRec();
    if (started && !pressedAt.current) setTapMode(true);
    return undefined;
  }
  function micUp() {
    const held = Date.now() - pressedAt.current;
    pressedAt.current = 0;
    if (!rec.current || tapMode) return;
    if (held < 400) { setTapMode(true); return; }
    stopRec();
  }

  // The round button: a tap opens the assistant; holding it records straight away.
  function fabDown(e) {
    e.preventDefault();
    if (recording) return stopRec();
    clearTimeout(holdTimer.current);
    pressedAt.current = Date.now();
    holdTimer.current = setTimeout(async () => {
      holdTimer.current = null;
      setOpen(true);
      if (!micOk) return;
      // The button is gone once the panel opens, so the release is heard on
      // the whole window. Let go before the mic was ready: carry on in tap mode.
      let released = false;
      const onRelease = () => {
        released = true;
        window.removeEventListener("pointerup", onRelease);
        if (rec.current) stopRec();
      };
      window.addEventListener("pointerup", onRelease);
      const started = await startRec();
      if (!started) window.removeEventListener("pointerup", onRelease);
      else if (released) setTapMode(true);
    }, 350);
    return undefined;
  }
  function fabUp() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
      pressedAt.current = 0;
      setOpen(true);
      return;
    }
    micUp();
  }

  // The camera: a page of the old notebook, read into cards to check.
  async function openPhoto() {
    if (busy || recording) return;
    if (!(await ready(() => setPhotoMenu(true)))) return;
    setPhotoMenu(true);
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setPhotoMenu(false);
    if (!file) return;
    setBusy(true);
    setBusyText("Reading the page… this can take up to half a minute.");
    try {
      let prepared;
      try {
        prepared = await preparePhoto(file);
      } catch {
        say({ role: "assistant", kind: "error", text: "That file isn't a photo TechDesk can read. Use a JPEG or PNG picture of the page." });
        return;
      }
      const hint = input.trim();
      setInput("");
      say({ role: "user", photo: prepared.preview, text: hint || "A page from my notebook" });
      const res = await voiceOrder.send({ image: prepared.image, imageMime: prepared.mime, text: hint || undefined });
      await handleResult(res, { source: "photo" });
    } finally {
      setBusy(false);
      setBusyText("");
    }
  }

  function save(msg) {
    const out = voiceOrder.apply(msg.drafts.filter((d) => allowed(d.type)), { actor: user?.name });
    if (out.saved) {
      updateMsg(msg.id, { saved: out.saved, undo: out.undo });
      window.dispatchEvent(new CustomEvent(VOICE_SAVED_EVENT));
    }
  }
  function undoMsg(msg) {
    voiceOrder.runUndo(msg.undo);
    updateMsg(msg.id, { undone: true, undo: null });
    window.dispatchEvent(new CustomEvent(VOICE_SAVED_EVENT));
    toast({ title: "Undone", tone: "info" });
  }

  function startPractice() {
    const lessons = practiceLessons(db.getInventory(), db.getCustomers());
    setPractice({ step: 0, lessons, results: {} });
    say({ role: "assistant", kind: "info", text: "Practice: say each sentence, then see what TechDesk understood. Nothing is saved while you practise." });
  }

  const primaryBtn = `rounded-xl font-semibold ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`;
  const lesson = practice?.lessons?.[practice.step];

  return (
    <>
      {!open && (
        <button
          type="button"
          data-tour="voice-order"
          onPointerDown={fabDown}
          onPointerUp={fabUp}
          onPointerCancel={fabUp}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={recording ? "Stop recording" : "TechDesk Assistant: tap to open, hold to talk"}
          className={`fixed right-4 bottom-20 md:bottom-6 z-[45] w-14 h-14 rounded-full shadow-xl flex items-center justify-center select-none touch-none transition-transform active:scale-95 ${
            recording ? "bg-red-500 text-white animate-pulse" : "bg-gradient-to-br from-indigo-600 to-sky-500 text-white"
          }`}
        >
          {recording ? <Square className="w-5 h-5" /> : <Mic className="w-6 h-6" />}
        </button>
      )}

      {open && (
        <div className="td-overlay fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 sm:p-6" role="dialog" aria-modal="true" aria-label="TechDesk Assistant">
          <div className={`w-full sm:max-w-lg h-[92vh] sm:h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl ${t.cardBg}`}>
            <div className={`flex items-center gap-2 px-4 py-3 border-b ${t.divider}`}>
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-sky-500 text-white flex items-center justify-center"><Sparkles className="w-4 h-4" /></span>
              <div className="flex-1 min-w-0">
                <div className={`font-semibold ${t.textPrimary}`}>TechDesk Assistant</div>
                <div className={`text-xs ${t.textMuted}`}>{left != null ? `${Math.max(0, left)} left today on this device` : "Talk or type. You check everything before it's saved."}</div>
              </div>
              {!practice && <button type="button" onClick={startPractice} className={`text-xs font-semibold px-3 py-1.5 rounded-full ${t.pillBg}`}>Practice</button>}
              <button type="button" onClick={() => { cancelRec(); setOpen(false); }} className={t.textMuted} aria-label="Close"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 && !practice && (
                <div className="space-y-3">
                  <p className={`text-sm ${t.textSecondary}`}>Tell me what happened, or ask about your shop. For example:</p>
                  <ul className={`text-sm space-y-1 ${t.textSecondary}`}>
                    <li>• “Sell two chargers to Chidi, he paid transfer.”</li>
                    <li>• “Add ten iPhone 11 batteries at eleven thousand each.”</li>
                    <li>• “New repair for Aisha, Samsung A54 not charging, fifteen thousand.”</li>
                    <li>• “Mark Chidi's iPhone as ready.” · “Aisha paid five thousand.”</li>
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    {EXAMPLES.map((q) => (
                      <button key={q} type="button" onClick={() => sendText(q)} className={`text-xs px-3 py-1.5 rounded-full ${t.pillBg}`}>{q}</button>
                    ))}
                  </div>
                  <button type="button" onClick={openPhoto} className={`w-full flex items-center gap-3 rounded-2xl p-3 text-left border ${t.divider}`}>
                    <span className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 text-white flex items-center justify-center"><NotebookPen className="w-5 h-5" /></span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-semibold ${t.textPrimary}`}>Bring in your old notebook</span>
                      <span className={`block text-xs ${t.textMuted}`}>Snap a page of sales, repairs or stock. Each line becomes a record you check, on the date it was written.</span>
                    </span>
                  </button>
                  <button type="button" onClick={startPractice} className={`text-sm underline underline-offset-2 ${t.textSecondary}`}>New to this? Take the 2-minute practice →</button>
                </div>
              )}

              {messages.map((m) => (
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-sm bg-gradient-to-br from-indigo-600 to-sky-500 text-white">
                      {m.heard && <span className="block text-[10px] uppercase tracking-wider opacity-75">Heard</span>}
                      {m.photo && <img src={m.photo} alt="Notebook page" className="rounded-xl mb-1.5 max-h-56 w-auto" />}
                      {m.text}
                    </div>
                  </div>
                ) : m.kind === "drafts" ? (
                  <div key={m.id} data-msg={m.id} className="space-y-2 scroll-mt-2">
                    {m.photo && (() => {
                      const actionable = m.drafts.filter((d) => !["question", "unknown"].includes(d.type));
                      const allOn = actionable.every((d) => d.include);
                      return (
                        <div className={`rounded-2xl px-3 py-2 text-sm ${t.insetBg} ${t.textSecondary}`}>
                          <p>I read <b className={t.textPrimary}>{actionable.length} {actionable.length === 1 ? "entry" : "entries"}</b> from your page. Handwriting can be misread: check each one, especially amounts and dates. Untick anything you've already entered.</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {!m.saved && !m.undone && (
                              <button type="button" onClick={() => updateMsg(m.id, { drafts: m.drafts.map((d) => (["question", "unknown"].includes(d.type) || !allowed(d.type) ? d : { ...d, include: !allOn })) })}
                                className={`text-xs px-3 py-1 rounded-full ${t.pillBg}`}>{allOn ? "Untick all" : "Tick all"}</button>
                            )}
                            {m.pageText && (
                              <details className="w-full">
                                <summary className={`text-xs cursor-pointer ${t.textMuted}`}>What I read on the page</summary>
                                <p className={`text-xs mt-1 whitespace-pre-line ${t.textSecondary}`}>{m.pageText}</p>
                              </details>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    {m.practice && (
                      <p className={`text-sm font-semibold ${m.passed ? "text-emerald-500" : "text-amber-500"}`}>
                        {m.passed ? "✓ Understood. Nothing was saved, this is practice." : "Not quite. Check the tips, try again, or move on."}
                      </p>
                    )}
                    {m.drafts.map((d, i) => (
                      <DraftCard key={d.id} d={d} t={t} settings={settings} allowed={allowed} practice={m.practice}
                        update={(nd) => !m.saved && updateMsg(m.id, { drafts: m.drafts.map((x, j) => (j === i ? nd : x)) })} />
                    ))}
                    {!m.practice && (() => {
                      const savable = m.drafts.filter((d) => d.include && allowed(d.type) && voiceOrder.issues(d).length === 0);
                      const blocked = m.drafts.filter((d) => d.include && voiceOrder.issues(d).length > 0);
                      if (m.undone) return <p className={`text-xs ${t.textMuted}`}>Undone.</p>;
                      if (m.saved) {
                        return (
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-emerald-500 font-semibold">✓ Saved {m.saved}</span>
                            {m.undo && <button type="button" onClick={() => undoMsg(m)} className={`flex items-center gap-1 px-3 py-1 rounded-full ${t.pillBg}`}><Undo2 className="w-3.5 h-3.5" /> Undo</button>}
                          </div>
                        );
                      }
                      if (!m.drafts.some((d) => !["question", "unknown"].includes(d.type))) return null;
                      return (
                        <>
                          {blocked.length > 0 && <p className="text-xs text-amber-500">Fix the yellow notes, or untick those actions, to save.</p>}
                          <button type="button" disabled={!savable.length || blocked.length > 0} onClick={() => save(m)} className={`w-full py-2.5 text-sm disabled:opacity-40 ${primaryBtn}`}>
                            {savable.length ? `Save ${savable.length} ${savable.length === 1 ? "action" : "actions"}` : "Nothing ready to save"}
                          </button>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div key={m.id} className={`max-w-[90%] rounded-2xl rounded-bl-md px-3 py-2 text-sm ${m.kind === "error" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : t.insetBg + " " + t.textSecondary}`}>
                    {m.text}
                  </div>
                )
              ))}

              {practice && (
                <div className={`rounded-2xl p-3 border ${t.divider}`}>
                  {lesson ? (
                    <>
                      <div className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>Practice {practice.step + 1} of {practice.lessons.length} · {lesson.title}</div>
                      <p className={`text-base font-semibold mt-1 ${t.textPrimary}`}>Say: “{lesson.say}”</p>
                      <p className={`text-xs mt-1 ${t.textMuted}`}>Hold the mic below and say it, or type it. Nothing is saved.</p>
                      <div className="flex gap-2 mt-2">
                        <button type="button" onClick={() => sendText(lesson.say, { practiceStep: practice.step })} className={`text-xs px-3 py-1.5 rounded-full ${t.pillBg}`}>Send it as text</button>
                        <button type="button" onClick={() => setPractice((p) => ({ ...p, step: p.step + 1 }))} className={`text-xs px-3 py-1.5 rounded-full ${t.pillBg}`}>
                          {practice.results[practice.step] != null ? "Next →" : "Skip"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={`font-semibold ${t.textPrimary}`}>
                        Practice done: {Object.values(practice.results).filter(Boolean).length} of {practice.lessons.length} understood
                      </div>
                      <ul className={`text-sm mt-2 space-y-1 ${t.textSecondary}`}>{TIPS.map((tip) => <li key={tip}>• {tip}</li>)}</ul>
                      <button type="button" onClick={() => { setPractice(null); say({ role: "assistant", kind: "info", text: "Ready when you are. Tell me what happened, or ask a question." }); }} className={`w-full py-2.5 text-sm mt-3 ${primaryBtn}`}>Start using it</button>
                    </>
                  )}
                  {lesson && practice.step === 0 && (
                    <details className="mt-2">
                      <summary className={`text-xs cursor-pointer ${t.textMuted}`}>Tips for being understood</summary>
                      <ul className={`text-xs mt-1 space-y-1 ${t.textSecondary}`}>{TIPS.map((tip) => <li key={tip}>• {tip}</li>)}</ul>
                    </details>
                  )}
                </div>
              )}

              {busy && <div className={`text-sm flex items-center gap-2 ${t.textMuted}`}><Loader2 className="w-4 h-4 animate-spin" /> {busyText || "Working it out…"}</div>}
              <div ref={listEnd} />
            </div>

            <form
              className={`flex items-center gap-2 px-3 py-3 border-t ${t.divider}`}
              onSubmit={(e) => { e.preventDefault(); sendText(input, practice && lesson ? { practiceStep: practice.step } : undefined); }}
            >
              {recording ? (
                <div className="flex-1 flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className={t.textPrimary}>{tapMode ? "Listening… tap the mic to finish" : "Listening… let go to send"} · {seconds}s</span>
                  <button type="button" onClick={cancelRec} className={`ml-auto text-xs underline ${t.textMuted}`}>Cancel</button>
                </div>
              ) : (
                <>
                <button type="button" onClick={openPhoto} disabled={busy || !!practice} aria-label="Photo of a notebook page"
                  className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center disabled:opacity-40 ${t.pillBg}`}>
                  <Camera className="w-5 h-5" />
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type, or hold the mic and talk…"
                  aria-label="Message"
                  className={`flex-1 min-w-0 rounded-full px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
                />
                </>
              )}
              {!recording && input.trim() ? (
                <button type="submit" disabled={busy} aria-label="Send" className="w-11 h-11 shrink-0 rounded-full bg-gradient-to-br from-indigo-600 to-sky-500 text-white flex items-center justify-center disabled:opacity-50">
                  <Send className="w-5 h-5" />
                </button>
              ) : micOk ? (
                <button
                  type="button"
                  disabled={busy}
                  onPointerDown={micDown}
                  onPointerUp={micUp}
                  onPointerCancel={micUp}
                  onContextMenu={(e) => e.preventDefault()}
                  aria-label={recording ? "Stop recording" : "Hold to talk"}
                  className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-white select-none touch-none disabled:opacity-50 ${recording ? "bg-red-500 animate-pulse" : "bg-gradient-to-br from-indigo-600 to-sky-500"}`}
                >
                  {recording ? <Square className="w-4 h-4" /> : <Mic className="w-5 h-5" />}
                </button>
              ) : null}
            </form>
          </div>
        </div>
      )}

      <input ref={camInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} data-testid="photo-camera" />
      <input ref={pickInput} type="file" accept="image/*" className="hidden" onChange={onPhoto} data-testid="photo-pick" />

      {photoMenu && (
        <Sheet t={t} onClose={() => setPhotoMenu(false)} label="Notebook photo">
          <h2 className={`text-lg font-bold mb-1 ${t.textPrimary}`}>A page from your notebook</h2>
          <ul className={`text-sm space-y-1 mb-4 ${t.textSecondary}`}>
            <li>• One page at a time, lying flat, in good light.</li>
            <li>• Fill the photo with the page, so the writing is big.</li>
            <li>• Want to add a note, like “these are March sales”? Type it first, then take the photo.</li>
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => camInput.current?.click()} className={`py-3 flex flex-col items-center gap-1 ${primaryBtn}`}>
              <Camera className="w-5 h-5" /> Take a photo
            </button>
            <button type="button" onClick={() => pickInput.current?.click()} className={`py-3 flex flex-col items-center gap-1 rounded-xl font-semibold ${t.pillBg}`}>
              <ImagePlus className="w-5 h-5" /> Choose a photo
            </button>
          </div>
        </Sheet>
      )}

      {sheet === "offline" && (
        <Sheet t={t} onClose={() => setSheet(null)} label="No internet">
          <div className="text-center py-2">
            <Wifi className={`w-10 h-10 mx-auto mb-3 ${t.textMuted}`} />
            <h2 className={`text-lg font-bold mb-1 ${t.textPrimary}`}>Connect to the internet</h2>
            <p className={`text-sm mb-5 ${t.textSecondary}`}>The assistant needs the internet. Everything else in TechDesk keeps working offline.</p>
            <button type="button" onClick={async () => { if (await voiceOrder.isOnline()) setSheet(null); }} className={`w-full py-3 ${primaryBtn}`}>Try again</button>
          </div>
        </Sheet>
      )}

      {sheet === "consent" && (
        <Sheet t={t} onClose={() => setSheet(null)} label="About the assistant">
          <h2 className={`text-lg font-bold mb-2 ${t.textPrimary}`}>TechDesk Assistant</h2>
          <ul className={`text-sm space-y-2 mb-4 ${t.textSecondary}`}>
            <li>• Say or type what happened: <i>“Sell two chargers to Chidi, he paid transfer. Add ten iPhone 11 batteries.”</i> Or ask: <i>“Who owes me?”</i></li>
            <li>• You check everything before it's saved. Nothing is saved on its own.</li>
            <li>• Hold the mic while you talk and let go to send, or tap once to start and again to finish.</li>
            <li>• Snap a page of your old notebook and each line becomes a record to check.</li>
            <li>• What you say, type or photograph, and your product names, are sent to Google's Gemini AI to understand them. Google may use them to improve its products. Your saved customers, prices and sales are not sent: answers are worked out on this device. A notebook photo sends what's written on that page. <a href={`${SITE_ORIGIN}/privacy`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Privacy policy</a></li>
          </ul>
          <button type="button" onClick={() => { voiceOrder.giveVoiceConsent(); setSheet(null); const next = afterConsent.current; afterConsent.current = null; next?.(); }}
            className={`w-full py-3 ${primaryBtn}`}>
            I understand, turn it on
          </button>
          <button type="button" onClick={() => setSheet(null)} className={`w-full py-2 mt-2 text-sm ${t.textMuted}`}>Not now</button>
        </Sheet>
      )}

      {sheet === "error" && (
        <Sheet t={t} onClose={() => setSheet(null)} label="Problem">
          <h2 className={`text-lg font-bold mb-2 ${t.textPrimary}`}>That didn't work</h2>
          <p className={`text-sm mb-4 ${t.textSecondary}`}>{error}</p>
          <button type="button" onClick={() => setSheet(null)} className={`w-full py-3 ${primaryBtn}`}>OK</button>
        </Sheet>
      )}
    </>
  );
}
