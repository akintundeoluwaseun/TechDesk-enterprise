import React from "react";

/** A raised card. The whole look is this shape on the blue-grey ground. */
export function Card({ className = "", children, ...rest }) {
  return (
    <div className={`bg-card rounded-xl2 shadow-raised ${className}`} {...rest}>
      {children}
    </div>
  );
}

/** A coloured circle behind an icon, as in the four stat tiles. */
export function IconBubble({ tone = "blue", children }) {
  const tones = {
    green: "bg-emerald-100 text-emerald-600",
    blue: "bg-blue-100 text-blue-600",
    violet: "bg-violet-100 text-violet-600",
    red: "bg-rose-100 text-rose-500",
    amber: "bg-amber-100 text-amber-600",
    slate: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`grid place-items-center w-11 h-11 rounded-full ${tones[tone] || tones.blue}`}>
      {children}
    </span>
  );
}

export function StatTile({ tone, icon, value, label }) {
  return (
    <Card className="p-4 flex flex-col gap-3">
      <IconBubble tone={tone}>{icon}</IconBubble>
      <div>
        <div className="text-2xl font-bold leading-none tabular-nums">{value}</div>
        <div className="text-xs text-ink-soft mt-1.5 leading-snug">{label}</div>
      </div>
    </Card>
  );
}

/** A green or amber dot with its word, for online and offline. */
export function StatusDot({ online }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`w-2 h-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`} />
      <span className={online ? "text-emerald-600" : "text-amber-600"}>
        {online ? "Online" : "Offline"}
      </span>
    </span>
  );
}

export function SectionHeader({ icon, title, action, onAction }) {
  return (
    <div className="flex items-center justify-between px-1 mb-3">
      <div className="flex items-center gap-2.5">
        <span className="text-ink-soft">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {action && (
        <button onClick={onAction} className="text-sm text-ink-soft flex items-center gap-1">
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
