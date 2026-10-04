import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Sunrise, TrendingUp, TrendingDown, MessageCircle, ArrowRight, Wrench, Wallet, PackageX, Clock, Share2 } from "lucide-react";
import { buildBrief, briefText, briefOff, setBriefOff, chaseMessage, markChased } from "@techdesk/core";
import { openChaser } from "../lib/chaser";
import { useThemeTokens } from "../lib/ThemeContext";
import { useCloseOnBack } from "../lib/useCloseOnBack";
import { useAuth, canAccess } from "../lib/AuthContext";
import { useSettings } from "../lib/SettingsContext";
import { money } from "../lib/currency";
import { openWhatsApp } from "../lib/share";

// The morning brief: yesterday's takings, who owes, what's waiting to be
// collected, what's run out, and what to do about it today. Everything is
// worked out on this device (core/morningBrief.js); the WhatsApp buttons
// open a ready-written message the shop reads and sends itself.

const KIND = {
  collect: { icon: Wrench, tone: "bg-sky-500/15 text-sky-500" },
  owed: { icon: Wallet, tone: "bg-emerald-500/15 text-emerald-500" },
  restock: { icon: PackageX, tone: "bg-amber-500/15 text-amber-500" },
  slow: { icon: Clock, tone: "bg-rose-500/15 text-rose-500" },
};

const first = (n) => String(n || "").trim().split(/\s+/)[0] || "";

export function collectMessage(item, settings, fmt) {
  const shop = settings.shopName || "our shop";
  return [
    `Hello${first(item.name) ? ` ${first(item.name)}` : ""},`,
    "",
    `Your ${item.device} is ready for collection at ${shop}.${item.ticket ? ` Ticket: ${item.ticket}.` : ""}`,
    item.amount > 0 ? `Amount to pay: ${fmt(item.amount)}.` : null,
    "",
    "Thank you!",
  ].filter((l) => l !== null).join("\n");
}

export default function MorningBrief({ onClose, now }) {
  const t = useThemeTokens();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const [off, setOff] = useState(() => briefOff());
  useCloseOnBack(true, onClose);
  const b = useMemo(() => buildBrief({}, now || new Date()), [now]);
  const fmt = (n) => money(n || 0, settings);
  const can = (page) => canAccess(user, page);
  const showProfit = can("/reports");
  const todo = b.todo.filter((x) => can(x.page));
  const dateLabel = new Date(`${b.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const name = first(user?.name);

  function go(page) {
    onClose();
    navigate(page);
  }

  function share() {
    openWhatsApp("", briefText(b, { shop: settings.shopName, money: fmt, showProfit }));
  }

  const up = b.last.change != null && b.last.change >= 0;

  return (
    <div className="td-overlay fixed inset-0 z-[65] flex items-center justify-center bg-black/60 p-4 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="Morning brief" className={`w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl overflow-hidden ${t.cardBg}`}>
        <div className="relative shrink-0 overflow-hidden px-6 pt-6 pb-5 bg-neutral-950">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute rounded-full" style={{ width: 320, height: 320, right: -110, bottom: -230, background: "radial-gradient(circle, rgba(251,146,60,.65), rgba(244,63,94,.25) 45%, transparent 70%)" }} />
            <div className="absolute rounded-full" style={{ width: 220, height: 220, left: -90, top: -120, background: "radial-gradient(circle, rgba(99,102,241,.4), transparent 65%)" }} />
          </div>
          <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] uppercase text-amber-300">
              <Sunrise className="w-4 h-4" /> Morning brief
            </div>
            <h2 className="text-2xl font-bold text-white mt-1">{b.greeting}{name ? `, ${name}` : ""}</h2>
            <div className="text-sm text-neutral-400">{dateLabel}</div>

            {can("/sales") && (
              <div className="mt-4">
                <div className="text-xs text-neutral-400">{b.last.label} you took</div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-3xl font-bold text-white tabular-nums">{fmt(b.last.total)}</span>
                  {b.last.change != null && (
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${up ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                      {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {up ? "+" : ""}{b.last.change}% on the week before
                    </span>
                  )}
                </div>
                <div className="text-sm text-neutral-300 mt-0.5">
                  {b.last.sales} sale{b.last.sales === 1 ? "" : "s"}
                  {b.last.repairs ? ` · ${b.last.repairs} repair${b.last.repairs === 1 ? "" : "s"} done` : ""}
                  {showProfit ? ` · profit ${fmt(b.last.profit)}` : ""}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {can("/sales") && (
            <div className={`grid grid-cols-2 gap-2`}>
              <div className={`rounded-2xl p-3 ${t.insetBg}`}>
                <div className={`text-xs ${t.textMuted}`}>This week so far</div>
                <div className={`text-lg font-bold tabular-nums ${t.textPrimary}`}>{fmt(b.week.total)}</div>
                <div className={`text-xs ${t.textMuted}`}>{b.week.lastWeek > 0 ? `Same days last week: ${fmt(b.week.lastWeek)}` : `${b.week.sales} sales`}</div>
              </div>
              <button type="button" onClick={() => { onClose(); openChaser(); }} className={`text-left rounded-2xl p-3 ${t.insetBg}`}>
                <div className={`text-xs ${t.textMuted}`}>Owed to you</div>
                <div className={`text-lg font-bold tabular-nums ${b.owed.total > 0 ? "text-amber-500" : t.textPrimary}`}>{fmt(b.owed.total)}</div>
                <div className={`text-xs ${t.textMuted}`}>{b.owed.people ? `${b.owed.people} customer${b.owed.people === 1 ? "" : "s"} · chase them →` : "Nobody owes you"}</div>
              </button>
            </div>
          )}

          <section>
            <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${t.textMuted}`}>To do today</h3>
            {todo.length === 0 ? (
              <p className={`text-sm ${t.textSecondary}`}>Nothing waiting on you. Have a good day of trading.</p>
            ) : (
              <ul className="space-y-2">
                {todo.map((x, i) => {
                  const K = KIND[x.kind];
                  const Icon = K.icon;
                  const wa = (x.kind === "collect" || x.kind === "owed") && x.phone;
                  return (
                    <li key={i} className={`flex items-start gap-3 rounded-2xl p-3 border ${t.divider}`}>
                      <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${K.tone}`}><Icon className="w-[18px] h-[18px]" /></span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold ${t.textPrimary}`}>
                          {x.text}{x.money ? <span className="tabular-nums"> · {fmt(x.money)}</span> : null}
                        </div>
                        <div className={`text-xs ${t.textMuted}`}>{x.detail}</div>
                      </div>
                      {wa ? (
                        <button type="button" aria-label={`Message ${x.name} on WhatsApp`}
                          onClick={() => {
                            if (x.kind === "collect") return openWhatsApp(x.phone, collectMessage(x, settings, fmt));
                            // The chaser's words: firmer each time, with how to pay, and remembered as asked.
                            openWhatsApp(x.phone, chaseMessage(x.debt, { tone: x.debt.tone, lang: settings.chaseLang || "en", shop: settings.shopName, payTo: settings.payTo || "", money: fmt }));
                            markChased(x.debt.key, x.debt.tone);
                            return undefined;
                          }}
                          className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full bg-emerald-500 text-white">
                          <MessageCircle className="w-3.5 h-3.5" /> Message
                        </button>
                      ) : (
                        <button type="button" aria-label="Open" onClick={() => (x.kind === "owed" ? (onClose(), openChaser(x.debt.key)) : go(x.page))} className={`shrink-0 p-1.5 rounded-full ${t.pillBg}`}>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {can("/inventory") && b.low.length > 0 && (
            <section>
              <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${t.textMuted}`}>Running low{b.lowCount > b.low.length ? ` (${b.lowCount})` : ""}</h3>
              <div className="flex flex-wrap gap-1.5">
                {b.low.map((p) => (
                  <button key={p.id} type="button" onClick={() => go("/inventory")}
                    className={`text-xs px-2.5 py-1 rounded-full ${p.stock === 0 ? "bg-rose-500/15 text-rose-500" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}>
                    {p.name} · {p.stock === 0 ? "none left" : `${p.stock} left`}
                  </button>
                ))}
              </div>
            </section>
          )}

          {can("/repairs") && b.ready.length > 3 && (
            <button type="button" onClick={() => go("/repairs")} className={`text-sm underline underline-offset-2 ${t.textSecondary}`}>
              {b.ready.length} repairs are ready and waiting: see them all
            </button>
          )}
        </div>

        <div className={`shrink-0 px-5 pb-5 pt-3 border-t ${t.divider}`}>
          <div className="flex gap-2">
            <button type="button" onClick={share} className={`flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl text-sm font-semibold ${t.pillBg}`}>
              <Share2 className="w-4 h-4" /> Send
            </button>
            <button type="button" onClick={onClose} className={`flex-1 py-3 rounded-2xl font-semibold ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}>
              Start the day
            </button>
          </div>
          <label className={`flex items-center gap-2 text-xs mt-3 ${t.textMuted}`}>
            <input type="checkbox" checked={!off} onChange={(e) => { setOff(!e.target.checked); setBriefOff(!e.target.checked); }} className="w-4 h-4 accent-emerald-500" />
            Show this when I open TechDesk in the morning
          </label>
        </div>
      </div>
    </div>
  );
}
