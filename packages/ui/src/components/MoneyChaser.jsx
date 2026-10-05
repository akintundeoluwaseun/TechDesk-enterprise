import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Wallet, MessageCircle, Phone, CalendarClock, BadgeCheck, ChevronDown, Undo2, Landmark, Pencil } from "lucide-react";
import { addHistory, debtors, chaseMessage, markChased, setPromise, recordPayment, runChaseUndo, TONE_LABEL, LANGS, VOICE_PAYMENT_METHODS } from "@techdesk/core";
import { useThemeTokens } from "../lib/ThemeContext";
import { useCloseOnBack } from "../lib/useCloseOnBack";
import { useAuth, canAccess } from "../lib/AuthContext";
import { useSettings } from "../lib/SettingsContext";
import { money } from "../lib/currency";
import { openWhatsApp } from "../lib/share";
import { VOICE_SAVED_EVENT } from "./VoiceOrder";
import MoneyInput from "./MoneyInput";

// The money chaser: who owes, and a message to ask for it.
//
// Each customer's card opens a message ready to send on WhatsApp -- firmer
// with every reminder, held to any date they promised -- with the shop's
// transfer details in it. Payments are recorded here too, oldest debt first,
// with an undo. Nothing is sent by the app: WhatsApp opens with the words
// ready and the shop presses send.

const SECTIONS = [
  { status: "due", title: "To chase", empty: "Nobody to chase right now." },
  { status: "promised", title: "Promised to pay" },
  { status: "asked", title: "Asked today" },
  { status: "recent", title: "Not due yet", note: "Owed for less than 3 days.", collapsed: true },
];

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ago = (iso) => {
  const d = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

function DebtorCard({ d, t, settings, fmt, lang, focus, onChanged, payTo, actor }) {
  const [open, setOpen] = useState(focus ? "message" : null); // null | message | pay | promise
  const [tone, setTone] = useState(d.tone);
  const [text, setText] = useState("");
  const [edited, setEdited] = useState(false);
  const [amount, setAmount] = useState(d.total);
  const [method, setMethod] = useState("Bank Transfer");
  const [promise, setPromiseDay] = useState(d.chase.promise || dayKey(new Date(Date.now() + 3 * 86400000)));
  const [done, setDone] = useState(null); // {applied, undo}
  const ref = useRef(null);

  const draft = useMemo(() => chaseMessage(d, { tone, lang, shop: settings.shopName, payTo, money: fmt }), [d, tone, lang, settings.shopName, payTo]);
  useEffect(() => { if (!edited) setText(draft); }, [draft, edited]);
  useEffect(() => { if (focus) ref.current?.scrollIntoView?.({ block: "center" }); }, [focus]);

  function send() {
    openWhatsApp(d.phone, text);
    markChased(d.key, tone);
    addHistory(`Reminder sent · ${d.name || "customer"}`, "check");
    setOpen(null);
    onChanged();
  }
  function pay() {
    const out = recordPayment(d, amount, { method, actor });
    if (out.applied > 0) {
      setDone(out);
      addHistory(`Payment recorded · ${d.name || "customer"}`);
      setOpen(null);
      window.dispatchEvent(new CustomEvent(VOICE_SAVED_EVENT));
      onChanged();
    }
  }
  function undo() {
    runChaseUndo(done.undo);
    setDone(null);
    window.dispatchEvent(new CustomEvent(VOICE_SAVED_EVENT));
    onChanged();
  }

  const tones = ["friendly", "reminder", "firm", ...(d.chase.promise ? ["promise"] : [])];
  const meta = [
    `Owing ${d.days} day${d.days === 1 ? "" : "s"}`,
    d.chase.count ? `asked ${d.chase.count}× (last ${ago(d.chase.lastAt)})` : "not asked yet",
    d.chase.promise ? `${d.chase.broken ? "promised" : "will pay"} ${new Date(`${d.chase.promise}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div ref={ref} className={`rounded-2xl border p-3 ${focus ? "border-emerald-500/60" : t.divider}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className={`font-semibold ${t.textPrimary}`}>{d.name || "Unnamed customer"}</div>
          <div className={`text-xs ${d.chase.broken ? "text-rose-500" : t.textMuted}`}>{d.chase.broken ? "Missed their promised date · " : ""}{meta}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold tabular-nums text-amber-500">{fmt(d.total)}</div>
          {d.items.length > 1 && <div className={`text-xs ${t.textMuted}`}>{d.items.length} unpaid</div>}
        </div>
      </div>

      <details className="mt-1">
        <summary className={`text-xs cursor-pointer ${t.textMuted}`}>What for</summary>
        <ul className={`text-xs mt-1 space-y-0.5 ${t.textSecondary}`}>
          {d.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-2"><span className="min-w-0 truncate">{i.label}</span><span className="tabular-nums shrink-0">{fmt(i.owed)} · {i.days}d</span></li>
          ))}
        </ul>
      </details>

      {done && (
        <div className="mt-2 flex items-center gap-3 text-sm">
          <span className="text-emerald-500 font-semibold">✓ {fmt(done.applied)} recorded</span>
          <button type="button" onClick={undo} className={`flex items-center gap-1 text-xs px-3 py-1 rounded-full ${t.pillBg}`}><Undo2 className="w-3.5 h-3.5" /> Undo</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-2">
        <button type="button" onClick={() => setOpen(open === "message" ? null : "message")}
          className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full bg-emerald-500 text-white">
          <MessageCircle className="w-4 h-4" /> Message
        </button>
        {d.phone && (
          // A plain link: the Android WebView hands tel: to the phone's dialer.
          <a href={`tel:${String(d.phone).replace(/[^\d+]/g, "")}`}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full ${t.pillBg}`}>
            <Phone className="w-4 h-4" /> Call
          </a>
        )}
        <button type="button" onClick={() => setOpen(open === "pay" ? null : "pay")} className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full ${t.pillBg}`}>
          <BadgeCheck className="w-4 h-4" /> They paid
        </button>
        <button type="button" onClick={() => setOpen(open === "promise" ? null : "promise")} className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full ${t.pillBg}`}>
          <CalendarClock className="w-4 h-4" /> Promised
        </button>
      </div>

      {open === "message" && (
        <div className={`mt-3 rounded-xl p-3 ${t.insetBg}`}>
          <div className="flex flex-wrap gap-1.5 mb-2" role="radiogroup" aria-label="Tone">
            {tones.map((x) => (
              <button key={x} type="button" role="radio" aria-checked={tone === x} onClick={() => { setTone(x); setEdited(false); }}
                className={`text-xs px-3 py-1 rounded-full ${tone === x ? (t.dark ? "bg-white text-black" : "bg-neutral-900 text-white") : t.pillBg}`}>
                {TONE_LABEL[x]}{x === d.tone ? " · suggested" : ""}
              </button>
            ))}
          </div>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setEdited(true); }} rows={7} aria-label="Message"
            className={`w-full rounded-xl px-3 py-2 text-sm ${t.inputBg}`} />
          {!d.phone && <p className={`text-xs mt-1 ${t.textMuted}`}>No phone number saved: WhatsApp will ask who to send it to.</p>}
          <button type="button" onClick={send} className="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 text-white flex items-center justify-center gap-2">
            <MessageCircle className="w-4 h-4" /> Open WhatsApp
          </button>
        </div>
      )}

      {open === "pay" && (
        <div className={`mt-3 rounded-xl p-3 ${t.insetBg}`}>
          <div className="flex gap-2 flex-wrap">
            <label className={`text-xs flex-1 min-w-[120px] ${t.textMuted}`}>
              Amount received
              <MoneyInput value={amount ?? ""} onChange={(v) => setAmount(v === "" ? null : Number(v))}
                className={`w-full rounded-xl px-3 py-2 text-sm mt-1 tabular-nums ${t.inputBg}`} />
            </label>
            <label className={`text-xs flex-1 min-w-[120px] ${t.textMuted}`}>
              How
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={`w-full rounded-xl px-3 py-2 text-sm mt-1 ${t.inputBg}`}>
                {VOICE_PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
          </div>
          <p className={`text-xs mt-1 ${t.textMuted}`}>{Number(amount) >= d.total ? "Clears everything they owe." : "Goes to their oldest debt first."}</p>
          <button type="button" disabled={!(Number(amount) > 0)} onClick={pay}
            className={`w-full mt-2 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}>
            Record {fmt(Math.min(Number(amount) || 0, d.total))}
          </button>
        </div>
      )}

      {open === "promise" && (
        <div className={`mt-3 rounded-xl p-3 ${t.insetBg}`}>
          <label className={`text-xs ${t.textMuted}`}>
            They said they'll pay by
            <input type="date" min={dayKey(new Date())} value={promise} onChange={(e) => setPromiseDay(e.target.value)}
              className={`w-full rounded-xl px-3 py-2 text-sm mt-1 ${t.inputBg}`} />
          </label>
          <p className={`text-xs mt-1 ${t.textMuted}`}>They'll leave the list until then. If the day passes, they come back with a message that holds them to it.</p>
          <div className="flex gap-2 mt-2">
            <button type="button" disabled={!promise} onClick={() => { setPromise(d.key, promise); setOpen(null); onChanged(); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}>Save date</button>
            {d.chase.promise && (
              <button type="button" onClick={() => { setPromise(d.key, null); setOpen(null); onChanged(); }} className={`px-3 py-2.5 rounded-xl text-sm ${t.pillBg}`}>Clear</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MoneyChaser({ onClose, focusKey = null }) {
  const t = useThemeTokens();
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  useCloseOnBack(true, onClose);
  const [tick, setTick] = useState(0);
  const [showRecent, setShowRecent] = useState(false);
  const [editPay, setEditPay] = useState(false);
  const [payDraft, setPayDraft] = useState(settings.payTo || "");
  const fmt = (n) => money(n || 0, settings);
  const lang = settings.chaseLang && LANGS[settings.chaseLang] ? settings.chaseLang : "en";
  const list = useMemo(() => debtors({}, new Date(), { includeRepairs: canAccess(user, "/repairs") }), [tick, user]);
  const total = list.reduce((n, d) => n + d.total, 0);
  const refresh = () => setTick((n) => n + 1);

  return (
    <div className="td-overlay fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/60 sm:p-6" role="dialog" aria-modal="true" aria-label="Money owed">
      <div className={`w-full sm:max-w-lg h-[94vh] sm:h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden ${t.cardBg}`}>
        <div className={`flex items-start gap-3 px-5 pt-5 pb-4 border-b ${t.divider}`}>
          <span className="w-10 h-10 shrink-0 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center"><Wallet className="w-5 h-5" /></span>
          <div className="flex-1 min-w-0">
            <h2 className={`text-lg font-bold ${t.textPrimary}`}>Money owed to you</h2>
            <div className={`text-sm ${t.textSecondary}`}>
              <span className="font-semibold tabular-nums text-amber-500">{fmt(total)}</span> from {list.length} customer{list.length === 1 ? "" : "s"}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={t.textMuted}><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          <div className={`rounded-2xl p-3 ${t.insetBg}`}>
            <div className="flex items-center gap-2">
              <Landmark className={`w-4 h-4 shrink-0 ${t.textMuted}`} />
              <div className={`text-xs font-bold uppercase tracking-wider flex-1 ${t.textMuted}`}>How customers pay you</div>
              {!editPay && (
                <button type="button" onClick={() => { setPayDraft(settings.payTo || ""); setEditPay(true); }} className={`text-xs flex items-center gap-1 ${t.textSecondary}`}>
                  <Pencil className="w-3.5 h-3.5" /> {settings.payTo ? "Change" : "Add"}
                </button>
              )}
            </div>
            {editPay ? (
              <div className="mt-2">
                <input value={payDraft} onChange={(e) => setPayDraft(e.target.value)} placeholder="e.g. GTBank 0123456789 (Ade Gadgets)" aria-label="Transfer details"
                  className={`w-full rounded-xl px-3 py-2 text-sm ${t.inputBg}`} />
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => { updateSettings({ payTo: payDraft.trim() }); setEditPay(false); }}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}>Save</button>
                  <button type="button" onClick={() => setEditPay(false)} className={`px-3 py-2 rounded-xl text-sm ${t.pillBg}`}>Cancel</button>
                </div>
              </div>
            ) : (
              <p className={`text-sm mt-1 ${settings.payTo ? t.textPrimary : t.textMuted}`}>
                {settings.payTo || "Add your bank and account number, and every message tells customers where to transfer."}
              </p>
            )}
            {/* A choice only when there is more than one language to choose. */}
            {Object.keys(LANGS).length > 1 && (
            <div className="flex items-center gap-2 mt-3">
              <span className={`text-xs ${t.textMuted}`}>Messages in</span>
              {Object.entries(LANGS).map(([k, label]) => (
                <button key={k} type="button" onClick={() => updateSettings({ chaseLang: k })}
                  className={`text-xs px-3 py-1 rounded-full ${lang === k ? (t.dark ? "bg-white text-black" : "bg-neutral-900 text-white") : t.pillBg}`}>{label}</button>
              ))}
            </div>
            )}
          </div>

          {list.length === 0 && (
            <div className="text-center py-10">
              <BadgeCheck className="w-10 h-10 mx-auto text-emerald-500" />
              <p className={`mt-2 font-semibold ${t.textPrimary}`}>Nobody owes you anything.</p>
              <p className={`text-sm ${t.textMuted}`}>Sales on credit and unpaid repairs will show up here.</p>
            </div>
          )}

          {list.length > 0 && SECTIONS.map((sec) => {
            const items = list.filter((d) => d.status === sec.status);
            if (!items.length && sec.status !== "due") return null;
            const hidden = sec.collapsed && !showRecent && !items.some((d) => d.key === focusKey);
            const sum = items.reduce((n, d) => n + d.total, 0);
            return (
              <section key={sec.status}>
                <button type="button" disabled={!sec.collapsed} onClick={() => setShowRecent((v) => !v)} className="w-full flex items-center gap-2 mb-2 text-left">
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${t.textMuted}`}>{sec.title} ({items.length})</h3>
                  {items.length > 0 && <span className={`text-xs tabular-nums ${t.textMuted}`}>· {fmt(sum)}</span>}
                  {sec.collapsed && <ChevronDown className={`w-4 h-4 ml-auto ${t.textMuted} ${hidden ? "" : "rotate-180"}`} />}
                </button>
                {sec.note && !hidden && <p className={`text-xs mb-2 ${t.textMuted}`}>{sec.note}</p>}
                {!items.length && sec.empty && <p className={`text-sm ${t.textSecondary}`}>{sec.empty}</p>}
                {!hidden && (
                  <div className="space-y-2">
                    {items.map((d) => (
                      <DebtorCard key={d.key} d={d} t={t} settings={settings} fmt={fmt} lang={lang} payTo={settings.payTo || ""}
                        focus={d.key === focusKey} onChanged={refresh} actor={user?.name} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
