import React, { useState } from "react";
import { X } from "lucide-react";
import Bot from "./Bot";
import AnswerCard from "./AnswerCard";
import { brief } from "../insights";
import { money } from "../currency";
import { firstName, greeting } from "../format";

const SEEN = "techdesk_monitor_brief_day";
const OFF = "techdesk_monitor_brief_off";

/** Show the summary on start? Once a day, the first time Monitor opens, unless switched off. */
export function briefDue(today) {
  try {
    return localStorage.getItem(OFF) !== "1" && localStorage.getItem(SEEN) !== today;
  } catch {
    return false;
  }
}

/** The daily summary, on start: yesterday, today so far, what needs a look. */
export default function DailyBrief({ insights, owner, offline, onClose }) {
  const [off, setOff] = useState(() => { try { return localStorage.getItem(OFF) === "1"; } catch { return false; } });
  function close() {
    try {
      localStorage.setItem(SEEN, insights?.today || "");
      if (off) localStorage.setItem(OFF, "1"); else localStorage.removeItem(OFF);
    } catch { /* fine */ }
    onClose();
  }
  const b = brief(insights, money, { offline });
  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center bg-black/55 p-0 lg:p-6" onClick={close}>
      <div role="dialog" aria-label="Today's summary" onClick={(e) => e.stopPropagation()}
        className="w-full lg:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl lg:rounded-3xl bg-card border border-line shadow-raised">
        <div className="relative px-5 pt-5 pb-4 bg-gradient-to-br from-indigo-600 to-sky-500 text-white">
          <button onClick={close} aria-label="Close" className="absolute right-3 top-3 w-9 h-9 grid place-items-center rounded-full bg-white/15"><X size={18} /></button>
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-full bg-white/15 grid place-items-center"><Bot size={32} /></span>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-white/80">Today's summary</div>
              <div className="text-lg font-bold">{greeting()}{firstName(owner) ? `, ${firstName(owner)}` : ""}</div>
            </div>
          </div>
          <div className="mt-4 text-3xl font-bold tabular-nums">{b.figure}</div>
          <div className="text-sm text-white/85">{b.sub}</div>
        </div>
        <div className="p-4">
          <AnswerCard a={{ ...b, title: "At a glance", figure: null, sub: null }} />
          <label className="flex items-center gap-2 mt-4 text-sm text-ink-soft">
            <input type="checkbox" checked={!off} onChange={(e) => setOff(!e.target.checked)} />
            Show this when I open Monitor each day
          </label>
          <button onClick={close} className="w-full mt-4 py-3 rounded-2xl font-semibold bg-ink text-ground">Start the day</button>
          <p className="text-xs text-ink-faint text-center mt-3">Ask the assistant (bottom right) for more.</p>
        </div>
      </div>
    </div>
  );
}
