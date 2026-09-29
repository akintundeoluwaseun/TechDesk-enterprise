import React, { useEffect, useRef, useState } from "react";

/** A card: a step lighter than the ground, with a hairline edge. */
export function Card({ className = "", children, ...rest }) {
  return (
    <div className={`bg-card rounded-xl2 shadow-raised border border-white/[0.06] ${className}`} {...rest}>
      {children}
    </div>
  );
}

const TONES = {
  green: { bubble: "bg-emerald-500/15 text-emerald-400", glow: "rgba(52,211,153,0.35)" },
  blue: { bubble: "bg-sky-500/15 text-sky-400", glow: "rgba(56,189,248,0.35)" },
  violet: { bubble: "bg-violet-500/15 text-violet-400", glow: "rgba(167,139,250,0.35)" },
  red: { bubble: "bg-rose-500/15 text-rose-400", glow: "rgba(251,113,133,0.35)" },
  amber: { bubble: "bg-amber-500/15 text-amber-400", glow: "rgba(251,191,36,0.3)" },
  slate: { bubble: "bg-white/[0.06] text-ink-faint", glow: "rgba(148,160,181,0.2)" },
};

/** A coloured tile behind an icon. */
export function IconBubble({ tone = "blue", children }) {
  return (
    <span className={`grid place-items-center w-11 h-11 shrink-0 rounded-2xl ${(TONES[tone] || TONES.blue).bubble}`}>
      {children}
    </span>
  );
}

/** Counts up to a number, and from one number to the next on refresh. */
export function CountUp({ value }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still || target === from.current) {
      setShown(target);
      from.current = target;
      return undefined;
    }
    const start = performance.now();
    const begin = from.current;
    let raf;
    const step = (now) => {
      const t = Math.min(1, (now - start) / 700);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(begin + (target - begin) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return <>{shown}</>;
}

export function StatTile({ tone, icon, value, label, ...rest }) {
  const t = TONES[tone] || TONES.blue;
  return (
    <Card className="relative overflow-hidden p-4 flex flex-col gap-3 m-lift" {...rest}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 w-32 h-32 rounded-full"
        style={{ background: `radial-gradient(circle, ${t.glow}, transparent 70%)` }}
      />
      <IconBubble tone={tone}>{icon}</IconBubble>
      <div className="relative">
        <div className="text-3xl font-bold leading-none tabular-nums"><CountUp value={value} /></div>
        <div className="text-xs text-ink-soft mt-2 leading-snug">{label}</div>
      </div>
    </Card>
  );
}

/** A green or amber dot with its word, for online and offline. */
export function StatusDot({ online }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`w-2 h-2 rounded-full ${online ? "bg-emerald-400 m-live" : "bg-amber-400"}`} />
      <span className={online ? "text-emerald-400" : "text-amber-400"}>
        {online ? "Online" : "Offline"}
      </span>
    </span>
  );
}

export function SectionHeader({ icon, title, action, onAction, count }) {
  return (
    <div className="flex items-center justify-between px-1 mb-3">
      <div className="flex items-center gap-2.5">
        <span className="text-ink-faint">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
        {count > 0 && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/[0.08] text-ink-soft tabular-nums">{count}</span>
        )}
      </div>
      {action && (
        <button onClick={onAction} className="text-sm text-ink-soft hover:text-ink flex items-center gap-1">
          {action}
        </button>
      )}
    </div>
  );
}

/** Shown wherever there is genuinely nothing yet, rather than a blank space. */
export function Empty({ title, detail }) {
  return (
    <Card className="p-6 text-center">
      <p className="font-medium">{title}</p>
      {detail && <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">{detail}</p>}
    </Card>
  );
}

/** Slow light drifting behind everything, the same as the TechDesk app. */
export function Backdrop() {
  return (
    <div aria-hidden="true">
      <div className="m-glow" style={{ width: 520, height: 520, left: -180, top: -200, background: "radial-gradient(circle, rgba(99,102,241,0.28), transparent 65%)" }} />
      <div className="m-glow" style={{ width: 460, height: 460, right: -160, top: "40%", background: "radial-gradient(circle, rgba(56,189,248,0.18), transparent 65%)", animationDelay: "-7s", animationDirection: "alternate-reverse" }} />
      <div className="m-glow" style={{ width: 380, height: 380, left: "30%", bottom: -200, background: "radial-gradient(circle, rgba(52,211,153,0.12), transparent 65%)", animationDelay: "-12s" }} />
    </div>
  );
}
