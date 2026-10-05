import React from "react";

/** One answer, or the daily summary: a headline figure, a line under it, rows. */
export default function AnswerCard({ a }) {
  if (!a) return null;
  return (
    <div className="rounded-2xl border border-line bg-ground/60 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{a.title}</div>
      {a.figure && <div className="text-2xl font-bold tabular-nums mt-1 break-words">{a.figure}</div>}
      {a.sub && <div className="text-sm text-ink-soft mt-0.5">{a.sub}</div>}
      {a.rows?.length > 0 && (
        <div className="mt-3 divide-y divide-line">
          {a.rows.map((r, i) => (
            <div key={i} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{r.label}</div>
                {r.note && <div className="text-xs text-ink-faint">{r.note}</div>}
              </div>
              <div className="text-sm font-semibold tabular-nums shrink-0 text-right">{r.value}</div>
            </div>
          ))}
        </div>
      )}
      {a.tip && <div className="text-xs text-ink-faint mt-2">{a.tip}</div>}
    </div>
  );
}
