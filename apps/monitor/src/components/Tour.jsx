import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Sparkles, ArrowRight, X, BellRing } from "lucide-react";

// A spotlight tour: the screen goes dark except for one thing, with a card
// beside it saying what it is. Shown once, after the first sign-in, and again
// from Settings (or "Take the tour" on a computer) whenever the owner likes.

const KEY = "techdesk_monitor_tour_done";

export function tourDone() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return true; }
}
function markDone() {
  try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ }
}

const wide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

const STEPS = [
  {
    title: "Welcome to Monitor",
    text: "Every branch you run, live, wherever you are. Here's a quick look round.",
    Icon: Sparkles,
  },
  {
    target: "stats",
    title: "Your day at a glance",
    text: "Devices online, open repairs, today's sales, and anything that needs you, across every branch. It refreshes by itself every minute.",
  },
  {
    target: "chase",
    title: "Needs a look",
    text: "Customers who still owe you, and finished repairs nobody has collected. Tap the phone to call them. You'll get a reminder every 5 hours until it's sorted.",
  },
  {
    target: "sales",
    title: "Latest sales",
    text: "Who made each sale, at which branch, what they sold and for how much. Your phone buzzes for every one.",
  },
  {
    target: "devices",
    title: "Your branches' devices",
    text: "Which computers are reporting in right now. Tap one to open that branch's sales, repairs and stock.",
  },
  {
    target: () => (wide() ? "nav-desk" : "nav-phone"),
    title: "Everything else lives here",
    text: "Branches, today's report by branch, and Settings, where you can take this tour again.",
  },
  {
    title: "You're all set",
    text: "Notifications are on. We'll tell you when a sale is made, and keep reminding you who owes until they pay.",
    Icon: BellRing,
  },
];

function targetOf(step) {
  const name = typeof step.target === "function" ? step.target() : step.target;
  return name ? document.querySelector(`[data-tour="${name}"]`) : null;
}

export default function Tour({ onDone }) {
  // Steps whose target isn't on screen (no one owes anything yet) are skipped.
  const [steps] = useState(() => STEPS.filter((s) => !s.target || targetOf(s)));
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const step = steps[i];

  const measure = useCallback(() => {
    const el = step && targetOf(step);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
  }, [step]);

  useLayoutEffect(() => {
    const el = step && targetOf(step);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    measure();
    const again = setTimeout(measure, 380); // after the smooth scroll lands
    return () => clearTimeout(again);
  }, [step, measure]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  function finish() {
    markDone();
    onDone();
  }
  function next() {
    if (i + 1 >= steps.length) finish();
    else setI(i + 1);
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "Enter") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!step) return null;
  const Icon = step.Icon;

  // The card sits below the spotlight if there's room, above it if not, and
  // centred when there's nothing to point at.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(360, vw - 32);
  let cardStyle;
  if (rect) {
    const below = rect.top + rect.height + 16;
    const fitsBelow = below + 220 < vh;
    const left = Math.max(16, Math.min(rect.left + rect.width / 2 - cardW / 2, vw - cardW - 16));
    cardStyle = fitsBelow ? { top: below, left, width: cardW } : { bottom: vh - rect.top + 16, left, width: cardW };
  } else {
    cardStyle = { top: "50%", left: "50%", width: cardW, transform: "translate(-50%, -50%)" };
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={step.title}>
      {rect ? (
        <div
          className="absolute rounded-3xl transition-all duration-300 ease-out pointer-events-none"
          style={{ ...rect, boxShadow: "0 0 0 9999px rgba(0,0,0,0.62), 0 0 0 2px rgba(255,255,255,0.95), 0 0 30px 4px rgba(255,255,255,0.18)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm m-fade" />
      )}
      {/* Clicks anywhere but the card move nothing: the tour stays in charge. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      <div
        key={i}
        className="absolute m-pop rounded-3xl border border-line bg-card backdrop-blur-xl p-5 shadow-raised"
        style={cardStyle}
      >
        {Icon && (
          <div className="w-12 h-12 mb-4 rounded-2xl grid place-items-center bg-ink">
            <Icon className="text-ground" size={22} />
          </div>
        )}
        <div className="flex items-start gap-3">
          <h2 className="flex-1 text-lg font-bold leading-snug">{step.title}</h2>
          <button onClick={finish} aria-label="Close tour" className="text-ink-faint hover:text-ink -mr-1 -mt-1 p-1">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-ink-soft leading-relaxed mt-1.5">{step.text}</p>
        <div className="flex items-center justify-between mt-5">
          <div className="flex gap-1.5" aria-hidden="true">
            {steps.map((_, n) => (
              <span key={n} className={`h-1.5 rounded-full transition-all ${n === i ? "w-5 bg-ink" : "w-1.5 bg-ink/20"}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {i > 0 && i < steps.length - 1 && (
              <button onClick={finish} className="px-3 py-2 text-sm text-ink-faint hover:text-ink">Skip</button>
            )}
            <button onClick={next} className="px-4 py-2 rounded-full bg-ink text-ground text-sm font-semibold flex items-center gap-1.5">
              {i === 0 ? "Show me" : i === steps.length - 1 ? "Done" : "Next"} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
