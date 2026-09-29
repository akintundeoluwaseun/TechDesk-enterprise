import React, { useState } from "react";
import {
  Bell,
  X,
  Sparkles,
  Compass,
  CalendarDays,
  Ticket,
  Sun,
  RefreshCw,
  Undo2,
  Zap,
  ShieldCheck,
  Printer,
  Smartphone,
  ChevronDown,
} from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { useCloseOnBack } from "../lib/useCloseOnBack";
import { UPDATES } from "../lib/whatsNew";

// Names an update entry in whatsNew.js can use for its icon.
export const ICONS = {
  sparkles: Sparkles,
  compass: Compass,
  calendar: CalendarDays,
  ticket: Ticket,
  sun: Sun,
  sync: RefreshCw,
  back: Undo2,
  zap: Zap,
  shield: ShieldCheck,
  printer: Printer,
  phone: Smartphone,
  bell: Bell,
};

const TONES = [
  "bg-indigo-500/15 text-indigo-500",
  "bg-sky-500/15 text-sky-500",
  "bg-emerald-500/15 text-emerald-500",
  "bg-amber-500/15 text-amber-500",
  "bg-rose-500/15 text-rose-500",
];

function ItemList({ items, t }) {
  return (
    <div className="td-stagger flex flex-col gap-4">
      {items.map((item, i) => {
        const Icon = ICONS[item.icon] || Sparkles;
        return (
          <div key={item.title} className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONES[i % TONES.length]}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0 pt-0.5">
              <div className={`text-sm font-semibold ${t.textPrimary}`}>{item.title}</div>
              <div className={`text-sm leading-relaxed ${t.textSecondary}`}>{item.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function WhatsNewModal({ onClose }) {
  const t = useThemeTokens();
  const [showEarlier, setShowEarlier] = useState(false);
  useCloseOnBack(true, onClose);
  const [latest, ...earlier] = UPDATES;
  if (!latest) return null;

  return (
    <div className="td-overlay fixed inset-0 z-[65] flex items-center justify-center bg-black/60 p-4 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label="What's new" className={`w-full max-w-md max-h-[88vh] flex flex-col rounded-3xl overflow-hidden ${t.cardBg}`}>
        <div className="relative shrink-0 overflow-hidden bg-neutral-950 px-6 pt-7 pb-6">
          <style>{`
            @keyframes wnDrift { to { transform: translate(40px, 20px) scale(1.15); } }
            @keyframes wnPop { from { opacity: 0; transform: scale(.4) rotate(-20deg); } to { opacity: 1; transform: none; } }
            @keyframes wnTwinkle { 0%, 100% { opacity: .15; transform: scale(.8); } 50% { opacity: 1; transform: scale(1.1); } }
            @media (prefers-reduced-motion: reduce) { .wn-motion, .wn-motion * { animation: none !important; } }
          `}</style>
          <div aria-hidden="true" className="wn-motion pointer-events-none absolute inset-0">
            <div className="absolute rounded-full" style={{ width: 280, height: 280, left: -90, top: -140, background: "radial-gradient(circle, rgba(99,102,241,.55), transparent 65%)", animation: "wnDrift 9s ease-in-out infinite alternate" }} />
            <div className="absolute rounded-full" style={{ width: 240, height: 240, right: -80, bottom: -130, background: "radial-gradient(circle, rgba(14,165,233,.45), transparent 65%)", animation: "wnDrift 11s ease-in-out infinite alternate-reverse" }} />
            {[
              { left: "78%", top: "22%", d: 0 },
              { left: "88%", top: "55%", d: 0.8 },
              { left: "68%", top: "70%", d: 1.6 },
            ].map((s, i) => (
              <span key={i} className="absolute w-1.5 h-1.5 rounded-full bg-white" style={{ left: s.left, top: s.top, animation: `wnTwinkle 2.4s ease-in-out ${s.d}s infinite` }} />
            ))}
          </div>

          <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>

          <div className="relative">
            <div
              className="wn-motion w-12 h-12 rounded-2xl mb-4 flex items-center justify-center p-[1.5px]"
              style={{ background: "linear-gradient(135deg,#818cf8,#38bdf8,#34d399)" }}
            >
              <div className="w-full h-full rounded-[14px] bg-neutral-950 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" style={{ animation: "wnPop .6s cubic-bezier(.3,1.5,.5,1) .15s backwards" }} />
              </div>
            </div>
            <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-sky-300">What&rsquo;s new</div>
            <h2 className="text-2xl font-bold text-white mt-1">{latest.title}</h2>
            <div className="text-sm text-neutral-400 mt-1">{latest.date}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <ItemList items={latest.items} t={t} />

          {earlier.length > 0 && (
            <div className={`mt-6 pt-4 border-t ${t.divider}`}>
              <button
                onClick={() => setShowEarlier((s) => !s)}
                className={`flex items-center gap-1.5 text-sm font-medium ${t.textSecondary}`}
              >
                Earlier updates
                <ChevronDown className={`w-4 h-4 transition-transform ${showEarlier ? "rotate-180" : ""}`} />
              </button>
              {showEarlier && (
                <div className="td-open mt-4 flex flex-col gap-6">
                  {earlier.map((u) => (
                    <div key={u.id}>
                      <div className={`text-sm font-bold ${t.textPrimary}`}>{u.title}</div>
                      <div className={`text-xs mb-3 ${t.textMuted}`}>{u.date}</div>
                      <ItemList items={u.items} t={t} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 px-6 pb-6">
          <button
            onClick={onClose}
            className={`w-full py-3.5 rounded-2xl font-semibold ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
