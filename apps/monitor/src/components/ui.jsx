import React, { useEffect, useRef, useState } from "react";

/** A card: a step lighter than the ground, with a hairline edge. */
export function Card({ className = "", children, ...rest }) {
  return (
    <div className={`bg-card rounded-xl2 shadow-raised border border-line ${className}`} {...rest}>
      {children}
    </div>
  );
}

// The same tinted icon tiles the TechDesk app's notifications use: a pale
// tint with a strong icon in light, a faint tint with a bright one in dark.
const TONES = {
  green: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
  blue: "bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400",
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400",
  red: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
  slate: "bg-ink/[0.07] text-ink-faint",
};

/** A coloured tile behind an icon. */
export function IconBubble({ tone = "blue", children }) {
  return (
    <span className={`grid place-items-center w-11 h-11 shrink-0 rounded-2xl ${TONES[tone] || TONES.blue}`}>
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
  return (
    <Card className="relative overflow-hidden p-4 flex flex-col gap-3 m-lift" {...rest}>
      <IconBubble tone={tone}>{icon}</IconBubble>
      <div>
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
      <span className={`w-2 h-2 rounded-full ${online ? "bg-emerald-500 m-live" : "bg-amber-500"}`} />
      <span className={online ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
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
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-ink/[0.08] text-ink-soft tabular-nums">{count}</span>
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

/** Two faint drifting lights behind everything, as in the TechDesk app. */
export function Backdrop() {
  return (
    <div aria-hidden="true">
      <div className="m-glow" style={{ width: 720, height: 720, right: -260, top: -320, background: "radial-gradient(circle, var(--glow-a), transparent 62%)" }} />
      <div className="m-glow" style={{ width: 620, height: 620, left: "18%", bottom: -360, background: "radial-gradient(circle, var(--glow-b), transparent 62%)", animationDelay: "-9s", animationDirection: "alternate-reverse" }} />
    </div>
  );
}
