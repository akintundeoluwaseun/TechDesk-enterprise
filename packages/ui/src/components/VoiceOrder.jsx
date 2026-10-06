import React, { useEffect, useRef, useState } from "react";
import { Mic, X, Check, Wifi, Undo2, AlertTriangle, Loader2, Square, Send, Camera, ImagePlus, ShoppingCart, Wrench, PackagePlus, Wallet, Sunrise, TrendingUp, Coins, Users, PackageX, PackageCheck, Trophy, GraduationCap, ChevronDown, History, RotateCcw, LayoutGrid, MessageSquare, Trash2, PackageSearch, BarChart3 } from "lucide-react";
import { voiceOrder, VOICE_PAYMENT_METHODS, featureOn, answerQuestion, quickIntent, debtors, assistantHistory, addHistory, clearHistory } from "@techdesk/core";
import { useNavigate } from "react-router-dom";
import AssistantBot from "./AssistantBot";
import MoneyInput from "./MoneyInput";
import SignatureField from "./SignatureField";
import { platform } from "@techdesk/platform";

// Live speech-to-text where the device has it; off for good on this device
// once it has failed, so the next try records audio straight away.
const LIVE_OFF = "techdesk_live_speech_off";
// The shop's choice: "ai" sends the recording for the AI to listen to --
// slower, but it hears Nigerian names the phone's English listener spells
// as English words.
const LISTEN_MODE = "techdesk_listen_mode";
function liveEngine() {
  try {
    if (localStorage.getItem(LIVE_OFF) === "1" || localStorage.getItem(LISTEN_MODE) === "ai") return null;
    return platform().speech || null;
  } catch {
    return null;
  }
}
function listenMode() {
  try { return localStorage.getItem(LISTEN_MODE) === "ai" ? "ai" : "fast"; } catch { return "fast"; }
}
function setListenMode(mode) {
  try {
    if (mode === "ai") localStorage.setItem(LISTEN_MODE, "ai");
    else { localStorage.removeItem(LISTEN_MODE); localStorage.removeItem(LIVE_OFF); }
  } catch { /* fine */ }
}
/** The end of what's been heard, so the newest words are the ones on screen. */
const tail = (s, n = 64) => (s.length > n ? `…${s.slice(-n).replace(/^\S*\s/, "")}` : s);
import { useThemeTokens } from "../lib/ThemeContext";
import { SITE_ORIGIN } from "@techdesk/editions";
import { useAuth, canAccess } from "../lib/AuthContext";
import { useSettings } from "../lib/SettingsContext";
import { money } from "../lib/currency";
import { toast } from "../lib/toast";
import { db } from "../lib/db";
import { canRecord, startRecording, blobToWavBase64, MAX_SECONDS } from "../lib/voiceRecorder";
import { preparePhoto } from "../lib/photoPrep";
import { openBrief } from "../lib/brief";
import { openChaser } from "../lib/chaser";
import { openRestock } from "../lib/restock";

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

const PAGE_FOR = { sale: "/sales", payment: "/sales", return: "/sales", edit_sale: "/sales", cancel_sale: "/sales", repair: "/repairs", repair_status: "/repairs", stock: "/inventory" };
const TITLE = { sale: "Sale", repair: "New repair", stock: "Stock", repair_status: "Repair status", payment: "Payment", return: "Return", edit_sale: "Correct a sale", cancel_sale: "Cancel a sale", question: "Question", unknown: "Not understood" };

function Sheet({ children, onClose, t, label }) {
  return (
    <div className="td-overlay fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" role="dialog" aria-modal="true" aria-label={label}>
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

// Figures are typed the way a shop writes them: 15,000, not 15000.
function NumberField({ label, value, onChange, t }) {
  return (
    <label className={`text-xs ${t.textMuted} flex-1 min-w-[90px]`}>
      {label}
      <MoneyInput
        value={value ?? ""}
        onChange={(v) => onChange(v === "" ? null : Number(v))}
        className={`w-full rounded-xl px-3 py-2 text-sm mt-1 tabular-nums ${t.inputBg}`}
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

function AnswerCard({ a, t, settings, chase }) {
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
      {chase && a.lines.some((l) => l.money && l.value > 0) && (
        <button type="button" onClick={chase} className="mt-2 w-full py-2 rounded-xl text-sm font-semibold bg-emerald-500 text-white">Chase them on WhatsApp →</button>
      )}
    </div>
  );
}

// The close matches, or when nothing came close, every product: the AI
// may have missed what the shop meant.
function pickable(it) {
  if (it.candidates.length) return it.candidates;
  return db.getInventory()
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .slice(0, 300)
    .map((c) => ({ id: c.id, name: c.name, price: c.price, costPrice: c.costPrice, stock: c.stock }));
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
              {it.productId && (
                <Picker
                  t={t}
                  value=""
                  placeholder={`From your stock · ${it.stock ?? 0} left`}
                  options={[{ value: "__oneoff", label: `Not in my stock: sell "${it.said || it.name}" as a one-off item` }]}
                  onChange={(v) => {
                    if (v === "__oneoff") setItem({ productId: null, name: it.said || it.name, said: it.said || it.name, stock: null, costPrice: 0, candidates: [], oneOff: true });
                  }}
                />
              )}
              {!it.productId && it.oneOff && (
                <p className={`text-xs ${t.textMuted}`}>Not in your stock: sold as a one-off item. Stock isn't changed.</p>
              )}
              {!it.productId && (!it.oneOff || pickable(it).length > 0) && (
                <Picker
                  t={t}
                  value=""
                  placeholder={it.oneOff ? "Or pick one of your products…" : "Which product?"}
                  options={[
                    ...(it.oneOff ? [] : [{ value: "__oneoff", label: `Not in my stock: sell "${it.said}" as a one-off item` }]),
                    ...pickable(it).map((c) => ({ value: c.id, label: `${c.name} · ${fmt(c.price)} · ${c.stock} left` })),
                  ]}
                  onChange={(v) => {
                    if (v === "__oneoff") return setItem({ oneOff: true });
                    const c = pickable(it).find((x) => x.id === v);
                    if (c) setItem({ productId: c.id, name: c.name, price: it.price != null ? it.price : Number(c.price) || 0, stock: Number(c.stock || 0), costPrice: Number(c.costPrice || 0), candidates: [] });
                  }}
                />
              )}
              <div className="flex gap-2 mt-1">
                <NumberField t={t} label="Qty" value={it.qty} onChange={(v) => setItem({ qty: Math.max(1, Math.round(v || 1)) })} />
                <NumberField t={t} label="Price each" value={it.price} onChange={(v) => setItem({ price: v })} />
              </div>
              <div className="flex mt-1">
                <TextField t={t} label="IMEI / Serial number (if it has one)" value={it.imei} onChange={(v) => setItem({ imei: v })} />
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
        {d.source !== "photo" && (
          <div className="mt-3">
            <SignatureField value={d.signature} onChange={(v) => set({ signature: v })} />
            {!settings?.ownerSignature && (
              <p className={`text-xs mt-1.5 ${t.textMuted}`}>Your own signature isn't on receipts yet. Add it once in Settings → Shop.</p>
            )}
          </div>
        )}
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
<div className="flex gap-2 flex-wrap mt-1">
          <TextField t={t} label="Fault" value={d.problem} onChange={(v) => set({ problem: v })} />
          <TextField t={t} label="IMEI / Serial" value={d.serial} onChange={(v) => set({ serial: v })} />
        </div>
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
  } else if (d.type === "edit_sale" || d.type === "cancel_sale") {
    const sale = d.pick ? db.getSales().find((x) => x.id === d.pick.saleId) : null;
    const c = d.change || {};
    const item = sale && d.itemIdx != null ? sale.items[d.itemIdx] : null;
    body = (
      <>
        {!d.pick && d.matches.length > 0 && (
          <Picker t={t} value="" placeholder={d.ask} options={d.matches.map((m, i) => ({ value: String(i), label: m.label }))}
            onChange={(v) => {
              if (v === "") return;
              const pick = d.matches[Number(v)];
              const picked = db.getSales().find((x) => x.id === pick.saleId);
              set({ pick, itemIdx: picked?.items?.length === 1 ? 0 : null });
            }} />
        )}
        {d.pick && (
          <div className={`rounded-xl p-2 text-sm ${t.insetBg} ${t.textPrimary}`}>
            {d.pick.label}
            {d.matches.length > 1 && <button type="button" onClick={() => set({ pick: null, itemIdx: null })} className={`ml-2 text-xs underline ${t.textMuted}`}>change</button>}
          </div>
        )}
        {d.type === "cancel_sale" && d.pick && (
          <p className="text-xs mt-1 text-rose-500">The whole sale is removed and its items go back into stock. Undo brings it back.</p>
        )}
        {d.type === "edit_sale" && sale && (
          <div className="mt-1 space-y-1">
            {(c.qty != null || c.price != null) && d.itemIdx == null && (
              <Picker t={t} value="" placeholder="Which item on the sale?" options={sale.items.map((i, idx) => ({ value: String(idx), label: `${i.name} ×${i.qty} · ${fmt(i.price)}` }))}
                onChange={(v) => v !== "" && set({ itemIdx: Number(v) })} />
            )}
            {item && (c.qty != null || c.price != null) && (
              <div className="flex gap-2">
                {c.qty != null && <NumberField t={t} label={`${item.name}: qty (was ${item.qty})`} value={c.qty} onChange={(v) => set({ change: { ...c, qty: v == null ? null : Math.round(v) } })} />}
                {c.price != null && <NumberField t={t} label={`Price each (was ${fmt(item.price)})`} value={c.price} onChange={(v) => set({ change: { ...c, price: v } })} />}
              </div>
            )}
            {c.paymentMethod && (
              <label className={`text-xs ${t.textMuted} block`}>
                Paid by (was {sale.paymentMethod || "—"})
                <select value={c.paymentMethod} onChange={(e) => set({ change: { ...c, paymentMethod: e.target.value } })} className={`w-full rounded-xl px-3 py-2 text-sm mt-1 ${t.inputBg}`}>
                  {VOICE_PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
            )}
            {c.amountPaid != null && <NumberField t={t} label={`Amount paid (was ${fmt(sale.amountPaid)})`} value={c.amountPaid} onChange={(v) => set({ change: { ...c, amountPaid: v } })} />}
            {c.customer && <TextField t={t} label={`Customer (was ${sale.customerName || "Walk-in"})`} value={c.customer} onChange={(v) => set({ change: { ...c, customer: v } })} />}
          </div>
        )}
      </>
    );
  } else if (d.type === "return") {
    const plan = d.pick ? { value: d.pick.price * Math.min(d.qty ?? d.pick.qty, d.pick.qty) } : null;
    body = (
      <>
        <p className={`text-sm ${t.textSecondary}`}>
          {d.said.customer ? `${d.said.customer} brought back ` : "Brought back: "}<b className={t.textPrimary}>{d.said.product || "an item"}</b>
        </p>
        {!d.pick && d.matches.length > 0 && (
          <Picker t={t} value="" placeholder={d.ask} options={d.matches.map((m, i) => ({ value: String(i), label: m.label }))}
            onChange={(v) => v !== "" && set({ pick: d.matches[Number(v)] })} />
        )}
        {d.pick && (
          <>
            <div className={`mt-1 rounded-xl p-2 text-sm ${t.insetBg} ${t.textPrimary}`}>
              <RotateCcw className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />{d.pick.label}
              {d.matches.length > 1 && <button type="button" onClick={() => set({ pick: null })} className={`ml-2 text-xs underline ${t.textMuted}`}>change</button>}
            </div>
            <div className="flex gap-2 mt-1">
              {d.pick.qty > 1 && <NumberField t={t} label={`How many (of ${d.pick.qty})`} value={d.qty ?? d.pick.qty} onChange={(v) => set({ qty: v == null ? null : Math.max(1, Math.round(v)) })} />}
              <NumberField t={t} label="Money given back (empty = what they paid for it)" value={d.refund} onChange={(v) => set({ refund: v })} />
            </div>
            <p className={`text-xs mt-1 ${t.textMuted}`}>Comes off the sale ({fmt(plan.value)}) and goes back into stock.</p>
          </>
        )}
      </>
    );
  } else if (d.question && d.answer) {
    const chase = ["who_owes", "customer_balance"].includes(d.intent) && allowed("payment") ? () => openChaser() : null;
    return <AnswerCard a={d.answer} t={t} settings={settings} chase={chase} />;
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

// One tap, no typing. "do" actions open the real thing; "ask" actions are
// answered on this device straight away -- offline, and without using up a
// turn of the AI.
const QUICK_DO = [
  { id: "sale", label: "New sale", icon: ShoppingCart, page: "/sales", tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { id: "repair", label: "New repair", icon: Wrench, page: "/repairs", tone: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  { id: "product", label: "Add product", icon: PackagePlus, page: "/inventory", tone: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  { id: "photo", label: "Snap notebook", icon: Camera, page: "/sales", tone: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
  { id: "owed", label: "Money owed", icon: Wallet, page: "/sales", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { id: "restock", label: "Restock list", icon: PackageSearch, page: "/inventory", tone: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
  { id: "reports", label: "Reports", icon: BarChart3, page: "/reports", tone: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400" },
  { id: "brief", label: "Today's brief", icon: Sunrise, page: null, tone: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
];
const QUICK_ASK = [
  { label: "Sales today", icon: Coins, intent: "sales_total", period: "today", page: "/sales" },
  { label: "Profit this week", icon: TrendingUp, intent: "profit", period: "this_week", page: "/reports" },
  { label: "Who owes me?", icon: Users, intent: "who_owes", page: "/sales" },
  { label: "Running low", icon: PackageX, intent: "low_stock", page: "/inventory" },
  { label: "Ready for pickup", icon: PackageCheck, intent: "repairs_ready", page: "/repairs" },
  { label: "Best sellers this month", icon: Trophy, intent: "top_products", period: "this_month", page: "/sales" },
];

const NUDGE_KEY = "techdesk_assistant_nudged_at";
const NUDGE_EVERY_MS = 3 * 60 * 60 * 1000;

/** Something worth saying from the robot's speech bubble, or null. */
function pickNudge(user, money) {
  const can = (p) => canAccess(user, p);
  try {
    if (can("/sales")) {
      const due = debtors({}, new Date(), { includeRepairs: can("/repairs") }).filter((d) => d.status === "due");
      if (due.length) {
        const sum = due.reduce((n, d) => n + d.total, 0);
        return { text: `${due.length} customer${due.length === 1 ? " owes" : "s owe"} you ${money(sum)}. Shall I help you remind them?`, action: "owed", cta: "Remind them" };
      }
    }
    if (can("/repairs")) {
      const ready = db.getRepairs().filter((r) => String(r.status || "").toLowerCase() === "completed").length;
      if (ready) return { text: `${ready} finished repair${ready === 1 ? " is" : "s are"} waiting to be collected.`, action: "ask:repairs_ready", cta: "Show me" };
    }
    if (can("/inventory")) {
      const low = db.getInventory().filter((i) => Number(i.stock || 0) <= Number(i.lowStockThreshold ?? 5)).length;
      if (low) return { text: `${low} product${low === 1 ? " is" : "s are"} running low.`, action: "ask:low_stock", cta: "Show me" };
    }
  } catch {
    // A nudge isn't worth an error.
  }
  return { text: "Hi! I'm your shop assistant. Tap me for quick actions, or hold me and just say what you sold.", action: "open", cta: "Show me" };
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
  const [nudge, setNudge] = useState(null); // the robot's speech bubble
  const [showExamples, setShowExamples] = useState(false);
  const [tab, setTab] = useState("home"); // home | chat | history
  const [liveText, setLiveText] = useState("");
  const navigate = useNavigate();
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

  // The robot says something useful a little after the app opens -- at most
  // every few hours, and never while the assistant is already open.
  useEffect(() => {
    let last = 0;
    try { last = Number(localStorage.getItem(NUDGE_KEY) || 0); } catch { /* fine */ }
    if (Date.now() - last < NUDGE_EVERY_MS) return undefined;
    const show = setTimeout(() => {
      setNudge(pickNudge(user, (n) => money(n, settings)));
      try { localStorage.setItem(NUDGE_KEY, String(Date.now())); } catch { /* fine */ }
    }, 4000);
    return () => clearTimeout(show);
  }, []);
  useEffect(() => {
    if (!nudge) return undefined;
    const hide = setTimeout(() => setNudge(null), 14000);
    return () => clearTimeout(hide);
  }, [nudge]);

  // Talking and typing need the AI; quick actions don't, so the robot stays
  // even when the console has paused the AI.
  const aiOn = featureOn("ai");
  const micOk = aiOn && canRecord();
  const [listen, setListen] = useState(listenMode);
  const hasLive = micOk && (() => { try { return !!platform().speech; } catch { return false; } })();
  const allowed = (type) => !PAGE_FOR[type] || canAccess(user, PAGE_FOR[type]);
  const say = (m) => { setTab("chat"); setMessages((list) => [...list, { id: mid(), ...m }]); };
  const updateMsg = (id, patch) => setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  /** Online and agreed to the notice; otherwise shows why and remembers what to do next. */
  async function ready(next) {
    // The phone's own answer, instantly: a server ping here used to hold up
    // the microphone, so the first words were lost. A send that finds no
    // connection says so then.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
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
    // The brief is worked out on the device: no need to ask the AI, or use up a turn.
    if (!opts && /^(show |open |give me )?(my |the |today'?s |this morning'?s )*(morning )?(brief|briefing)\b/i.test(clean)) {
      setInput("");
      setOpen(false);
      openBrief();
      return;
    }
    // "What should I buy?" is the restock planner, worked out here.
    if (!opts && /\b(restock|re-stock|what (should|do) i (buy|order)|shopping list|what to (buy|order)|order list)\b/i.test(clean) && canAccess(user, "/inventory")) {
      setInput("");
      say({ role: "user", text: clean });
      say({ role: "assistant", kind: "info", text: "Here's your restock list." });
      openRestock();
      return;
    }
    // Everyday questions are answered here, at once: no AI, no internet needed.
    const quick = !opts && quickIntent(clean);
    if (quick) {
      setInput("");
      say({ role: "user", text: clean });
      const label = clean.replace(/\?$/, "");
      addHistory(`Checked: ${label.length > 40 ? `${label.slice(0, 40)}…` : label.toLowerCase()}`, "check");
      say({ role: "assistant", kind: "drafts", drafts: [{ id: mid(), type: "question", question: true, include: false, intent: quick.intent, answer: answerQuestion(quick) }] });
      return;
    }
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
    const engine = liveEngine();
    if (engine) {
      try {
        setLiveText("");
        const session = await engine.start({ lang: "en-NG", onText: setLiveText });
        rec.current = { live: true, stop: session.stop, cancel: session.cancel };
      } catch (e) {
        if (e?.message === "not-allowed") {
          setError("TechDesk couldn't use the microphone. Allow microphone access for TechDesk in your phone or computer settings, then try again.");
          setSheet("error");
          return false;
        }
        // Speech-to-text isn't working here: record audio from now on.
        try { localStorage.setItem(LIVE_OFF, "1"); } catch { /* fine */ }
        rec.current = null;
      }
    }
    if (!rec.current) try {
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
    if (r.live) {
      // The words are already here: send them as text, which is quick.
      let text = "";
      try { text = await r.stop(); } catch { /* nothing heard */ }
      setLiveText("");
      if (!text.trim()) {
        say({ role: "assistant", kind: "error", text: "I didn't hear anything. Hold the mic, speak, then let go." });
        return;
      }
      await sendText(text, practice ? { practiceStep: practice.step } : undefined);
      return;
    }
    setBusy(true);
    try {
      setBusyText("Getting your voice note ready…");
      const blob = await r.stop();
      const { audio, seconds: len } = await blobToWavBase64(blob);
      setBusyText("Understanding what you said…");
      if (len < 0.8) {
        say({ role: "assistant", kind: "error", text: "That was too short. Hold the mic while you speak, or tap once to start and again to finish." });
        return;
      }
      const res = await voiceOrder.send({ audio, mime: "audio/wav" });
      setBusyText("Matching it to your records…");
      await handleResult(res, practice ? { practiceStep: practice.step } : undefined);
    } catch {
      say({ role: "assistant", kind: "error", text: "Couldn't read that recording. Try again." });
    } finally {
      setBusy(false);
      setBusyText("");
    }
  }

  function cancelRec() {
    clearInterval(timer.current);
    setLiveText("");
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
    addHistory("Undone", "undo");
    updateMsg(msg.id, { undone: true, undo: null });
    window.dispatchEvent(new CustomEvent(VOICE_SAVED_EVENT));
    toast({ title: "Undone", tone: "info" });
  }

  /** Answered here, from this device's records: instant, offline, free. */
  function askNow(q) {
    const answer = answerQuestion({ intent: q.intent, period: q.period });
    addHistory(`Checked: ${q.label.replace(/\?$/, "").toLowerCase()}`, "check");
    say({ role: "user", text: q.label });
    say({ role: "assistant", kind: "drafts", drafts: [{ id: mid(), type: "question", question: true, include: false, intent: q.intent, answer }] });
  }

  function runQuick(id) {
    if (id === "sale") { setOpen(false); navigate("/sales?new=1"); return; }
    if (id === "repair") { setOpen(false); navigate("/repairs?new=1"); return; }
    if (id === "product") { setOpen(false); navigate("/inventory?new=1"); return; }
    if (id === "photo") { openPhoto(); return; }
    if (id === "owed") { openChaser(); return; }
    if (id === "restock") { openRestock(); return; }
    if (id === "reports") { setOpen(false); navigate("/reports"); return; }
    if (id === "brief") { setOpen(false); openBrief(); }
  }

  function takeNudge() {
    const n = nudge;
    setNudge(null);
    if (!n) return;
    if (n.action === "owed") { openChaser(); return; }
    setOpen(true);
    if (n.action.startsWith("ask:")) {
      const q = QUICK_ASK.find((x) => x.intent === n.action.slice(4));
      if (q) askNow(q);
    }
  }

  function startPractice() {
    const lessons = practiceLessons(db.getInventory(), db.getCustomers());
    setPractice({ step: 0, lessons, results: {} });
    setTab("chat");
    say({ role: "assistant", kind: "info", text: "Practice: say each sentence, then see what TechDesk understood. Nothing is saved while you practise." });
  }

  const primaryBtn = `rounded-xl font-semibold ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`;
  const lesson = practice?.lessons?.[practice.step];

  return (
    <>
      <style>{`
        @keyframes tdPop { from { opacity: 0; transform: translateY(16px) scale(.97); } to { opacity: 1; transform: none; } }
        @keyframes tdBubble { from { opacity: 0; transform: translateY(8px) scale(.9); } to { opacity: 1; transform: none; } }
        @keyframes tdBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        .td-pop { animation: tdPop .22s cubic-bezier(.2,.9,.3,1.2); }
        .td-bubble { animation: tdBubble .3s cubic-bezier(.2,.9,.3,1.3); transform-origin: bottom right; }
        .td-bob { animation: tdBob 3s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .td-pop, .td-bubble, .td-bob { animation: none; } }
      `}</style>

      {!open && nudge && (
        <div className="td-bubble fixed right-4 bottom-[9.5rem] md:bottom-24 z-[46] w-[min(19rem,calc(100vw-2rem))]" role="status">
          <div className={`relative rounded-2xl rounded-br-md shadow-xl p-3 pr-8 border ${t.cardBg} ${t.divider}`}>
            <button type="button" onClick={() => setNudge(null)} aria-label="Dismiss" className={`absolute top-2 right-2 ${t.textMuted}`}><X className="w-4 h-4" /></button>
            <p className={`text-sm ${t.textPrimary}`}>{nudge.text}</p>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={takeNudge} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-gradient-to-br from-indigo-600 to-sky-500 text-white">{nudge.cta}</button>
              <button type="button" onClick={() => setNudge(null)} className={`text-xs px-3 py-1.5 rounded-full ${t.pillBg}`}>Not now</button>
            </div>
          </div>
        </div>
      )}

      {!open && (
        <button
          type="button"
          data-tour="voice-order"
          onPointerDown={fabDown}
          onPointerUp={fabUp}
          onPointerCancel={fabUp}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={recording ? "Stop recording" : "TechDesk Assistant: tap to open, hold to talk"}
          className={`fixed right-4 bottom-20 md:bottom-6 z-[45] w-16 h-16 rounded-full shadow-xl ring-4 ring-white/70 dark:ring-black/30 flex items-center justify-center select-none touch-none transition-transform active:scale-95 ${
            recording ? "bg-red-500 animate-pulse" : "bg-gradient-to-br from-indigo-600 to-sky-500"
          }`}
        >
          <span className={recording ? "" : "td-bob"}><AssistantBot size={40} listening={recording} /></span>
          {nudge && <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 ring-2 ring-white" />}
        </button>
      )}

      {open && (
        <>
          {/* Phones: a sheet over a dimmed app. Computers: a chat window in the corner. */}
          <div className="td-overlay fixed inset-0 z-[70] bg-black/50 sm:bg-black/10" onClick={() => { cancelRec(); setOpen(false); }} />
          <div role="dialog" aria-modal="true" aria-label="TechDesk Assistant"
            className={`td-pop fixed z-[71] inset-x-0 bottom-0 h-[92vh] sm:inset-auto sm:right-6 sm:bottom-6 sm:w-[420px] sm:h-[min(700px,88vh)] flex flex-col rounded-t-3xl sm:rounded-3xl shadow-2xl border overflow-hidden ${t.cardBg} ${t.divider}`}>
            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-br from-indigo-600 to-sky-500 text-white">
              <span className="w-11 h-11 shrink-0 rounded-full bg-white/15 flex items-center justify-center"><AssistantBot size={34} listening={recording} /></span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold leading-tight">TechDesk Assistant</div>
                <div className="text-xs text-white/80 truncate">
                  {recording ? "Listening…" : busy ? "Working…" : left != null ? `Here to help · ${Math.max(0, left)} AI uses left today` : "Here to help"}
                </div>
              </div>
              {!practice && aiOn && (
                <button type="button" onClick={startPractice} aria-label="Practice" title="Practice"
                  className="flex items-center gap-1 text-xs font-semibold p-2 sm:px-3 sm:py-1.5 rounded-full bg-white/15 hover:bg-white/25">
                  <GraduationCap className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Practice</span>
                </button>
              )}
              <button type="button" onClick={() => { cancelRec(); setOpen(false); }} className="p-1 rounded-full hover:bg-white/15" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            {/* Three places, always one tap apart: what you can do, the conversation, and what's been done. */}
            <div role="tablist" aria-label="Assistant" className={`grid grid-cols-3 gap-1 p-1 mx-3 mt-3 rounded-2xl ${t.insetBg}`}>
              {[["home", "Home", LayoutGrid], ["chat", "Chat", MessageSquare], ["history", "History", History]].map(([id, label, Icon]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                  className={`relative flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === id ? `${t.cardBg} ${t.textPrimary} shadow-sm` : t.textMuted}`}>
                  <Icon className="w-4 h-4" /> {label}
                  {id === "chat" && tab !== "chat" && messages.length > 0 && <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-sky-500" />}
                </button>
              ))}
            </div>

            {tab === "history" && (() => {
              const list = assistantHistory();
              const when = (iso) => {
                const d = new Date(iso);
                const today = new Date().toDateString() === d.toDateString();
                return today ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
              };
              return (
                <div className="flex-1 overflow-y-auto px-4 py-3" aria-label="History">
                  <div className="flex items-center pb-1">
                    <span className={`flex-1 text-[11px] font-bold uppercase tracking-wider ${t.textMuted}`}>What I've done</span>
                    {list.length > 0 && <button type="button" onClick={() => { clearHistory(); setTab("home"); }} className={`text-xs underline ${t.textMuted}`}>Clear</button>}
                  </div>
                  {list.length === 0 ? (
                    <p className={`py-3 text-sm ${t.textMuted}`}>Nothing yet. What you save or check will be listed here.</p>
                  ) : (
                    <ul>
                      {list.map((h, i) => (
                        <li key={i} className={`flex items-center gap-2 py-2 text-sm border-b last:border-0 ${t.divider}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${h.kind === "check" ? "bg-sky-500" : h.kind === "undo" ? "bg-neutral-400" : h.kind === "return" ? "bg-amber-500" : "bg-emerald-500"}`} />
                          <span className={`flex-1 min-w-0 truncate ${t.textPrimary}`}>{h.text}</span>
                          <span className={`text-xs shrink-0 tabular-nums ${t.textMuted}`}>{when(h.at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            {tab !== "history" && (
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {tab === "home" && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2">
                    <span className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-indigo-600 to-sky-500 flex items-center justify-center"><AssistantBot size={24} /></span>
                    <div className={`rounded-2xl rounded-tl-md px-3 py-2 text-sm ${t.insetBg} ${t.textPrimary}`}>
                      {new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}{user?.name ? `, ${String(user.name).split(" ")[0]}` : ""}! What would you like to do?
                    </div>
                  </div>

                  <section>
                    <h3 className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${t.textMuted}`}>Quick actions</h3>
                    <div className="grid grid-cols-4 gap-2">
                      {QUICK_DO.filter((q) => (q.page ? canAccess(user, q.page) : true) && (q.id !== "photo" || aiOn)).map((q) => {
                        const Icon = q.icon;
                        return (
                          <button key={q.id} type="button" onClick={() => runQuick(q.id)}
                            className={`flex flex-col items-center justify-start gap-1.5 rounded-2xl py-2.5 px-1 border transition-transform active:scale-95 ${t.divider}`}>
                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${q.tone}`}><Icon className="w-5 h-5" /></span>
                            <span className={`text-xs font-medium text-center leading-tight ${t.textPrimary}`}>{q.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section>
                    <h3 className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${t.textMuted}`}>Ask me · instant, works offline</h3>
                    <div className="flex flex-wrap gap-2">
                      {QUICK_ASK.filter((q) => canAccess(user, q.page)).map((q) => {
                        const Icon = q.icon;
                        return (
                          <button key={q.label} type="button" onClick={() => askNow(q)} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-full ${t.pillBg}`}>
                            <Icon className="w-3.5 h-3.5" /> {q.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {aiOn && (
                    <section className={`rounded-2xl p-3 ${t.insetBg}`}>
                      <button type="button" onClick={() => setShowExamples((v) => !v)} className="w-full flex items-center gap-2 text-left">
                        <Mic className={`w-4 h-4 ${t.textMuted}`} />
                        <span className={`flex-1 text-sm font-semibold ${t.textPrimary}`}>Or just tell me</span>
                        <ChevronDown className={`w-4 h-4 ${t.textMuted} ${showExamples ? "rotate-180" : ""}`} />
                      </button>
                      <p className={`text-xs mt-1 ${t.textMuted}`}>Hold the mic and talk, or type below. I fill it in; you check and save.</p>
                      {showExamples && (
                        <ul className={`text-sm mt-2 space-y-1.5 ${t.textSecondary}`}>
                          <li>“Sell two chargers to Chidi, he paid transfer.”</li>
                          <li>“Add ten iPhone 11 batteries at 11k each.”</li>
                          <li>“New repair for Aisha, Samsung A54 not charging, 15k.”</li>
                          <li>“Mark Chidi's iPhone as ready.” · “Aisha paid 5k.”</li>
                        </ul>
                      )}
                      <button type="button" onClick={startPractice} className={`mt-2 text-xs font-semibold underline underline-offset-2 ${t.textSecondary}`}>New to this? 2-minute practice →</button>
                      {hasLive && (
                        <div className="mt-3" role="radiogroup" aria-label="How the mic listens">
                          <div className={`text-xs font-semibold ${t.textSecondary}`}>How the mic listens</div>
                          <div className="mt-1.5 grid grid-cols-2 gap-2">
                            {[["fast", "Fast", "Words show as you talk"], ["ai", "Best for names", "AI listens: Bola Oluwatoyin, Chidi…"]].map(([id, label, sub]) => (
                              <button key={id} type="button" role="radio" aria-checked={listen === id}
                                onClick={() => { setListenMode(id); setListen(id); }}
                                className={`text-left rounded-xl px-3 py-2 border ${listen === id ? "border-indigo-500 ring-1 ring-indigo-500" : `border-transparent ${t.pillBg}`}`}>
                                <div className={`text-sm font-semibold ${t.textPrimary}`}>{label}</div>
                                <div className={`text-[11px] leading-tight ${t.textMuted}`}>{sub}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  )}
                </div>
              )}

              {tab === "chat" && messages.length === 0 && !practice && !busy && (
                <div className="text-center py-10">
                  <MessageSquare className={`w-8 h-8 mx-auto ${t.textMuted}`} />
                  <p className={`mt-2 text-sm ${t.textSecondary}`}>No conversation yet. Type below, hold the mic, or pick something on Home.</p>
                </div>
              )}
              {tab === "chat" && messages.length > 0 && !practice && (
                <div className="flex justify-end -mb-1">
                  <button type="button" onClick={() => setMessages([])} className={`flex items-center gap-1 text-xs ${t.textMuted}`}><Trash2 className="w-3.5 h-3.5" /> Clear chat</button>
                </div>
              )}
              {tab === "chat" && messages.map((m) => (
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

              {tab === "chat" && practice && (
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
            )}

            {tab === "chat" && messages.length > 0 && !practice && !recording && (
              <div className={`flex gap-1.5 overflow-x-auto px-3 pt-2 border-t ${t.divider}`} aria-label="Quick actions">
                {[...QUICK_DO.filter((q) => (q.page ? canAccess(user, q.page) : true) && (q.id !== "photo" || aiOn)).map((q) => ({ key: q.id, label: q.label, icon: q.icon, run: () => runQuick(q.id) })),
                  ...QUICK_ASK.filter((q) => canAccess(user, q.page)).map((q) => ({ key: q.label, label: q.label, icon: q.icon, run: () => askNow(q) }))].map((q) => {
                  const Icon = q.icon;
                  return (
                    <button key={q.key} type="button" onClick={q.run} className={`shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full ${t.pillBg}`}>
                      <Icon className="w-3.5 h-3.5" /> {q.label}
                    </button>
                  );
                })}
              </div>
            )}

            {!aiOn ? (
              <p className={`px-4 py-3 text-xs border-t ${t.divider} ${t.textMuted}`}>Talking and typing to the assistant are paused for now. Quick actions still work.</p>
            ) : (
            <form
              className={`flex items-center gap-2 px-3 py-3 ${tab === "chat" && messages.length > 0 && !practice && !recording ? "" : `border-t ${t.divider}`}`}
              onSubmit={(e) => { e.preventDefault(); sendText(input, practice && lesson ? { practiceStep: practice.step } : undefined); }}
            >
              {recording ? (
                <div className="flex-1 min-w-0 flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 shrink-0 rounded-full bg-red-500 animate-pulse" />
                  <span data-testid="live-text" className={`flex-1 min-w-0 line-clamp-2 break-words leading-snug ${liveText ? t.textPrimary + " font-medium" : t.textPrimary}`}>
                    {liveText ? tail(liveText) : (tapMode ? "Listening… tap the mic to finish" : "Listening… let go to send")}
                  </span>
                  {!liveText && <span className={`shrink-0 ${t.textMuted}`}>{seconds}s</span>}
                  <button type="button" onClick={cancelRec} className={`shrink-0 text-xs underline ${t.textMuted}`}>Cancel</button>
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
            )}
          </div>
        </>
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
