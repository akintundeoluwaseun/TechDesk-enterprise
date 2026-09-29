import React from "react";
import { FileText, TrendingUp } from "lucide-react";
import { Card, CountUp, Empty, IconBubble } from "../components/ui";

export default function ReportsScreen({ data }) {
  const branches = data?.branches || [];
  const stats = data?.stats || {};
  const total = branches.reduce((n, b) => n + (b.salesToday || 0), 0);

  return (
    <div className="px-4 lg:px-0 lg:max-w-3xl">
      <h1 className="text-2xl lg:text-3xl font-bold mb-1 m-rise">Reports</h1>
      <p className="text-ink-soft mb-5">Today, branch by branch.</p>

      <Card className="relative overflow-hidden p-5 mb-5 flex items-center gap-4 m-rise">
        <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 w-48 h-48 rounded-full" style={{ background: "radial-gradient(circle, rgba(167,139,250,0.35), transparent 70%)" }} />
        <IconBubble tone="violet"><TrendingUp size={19} /></IconBubble>
        <div>
          <div className="text-4xl font-bold leading-none tabular-nums"><CountUp value={stats.salesToday ?? total} /></div>
          <div className="text-sm text-ink-soft mt-1.5">sales across every branch today</div>
        </div>
      </Card>

      {branches.length === 0 ? (
        <Empty
          title="Nothing to report yet"
          detail="Once a branch connects and starts selling, its numbers show up here."
        />
      ) : (
        <Card className="divide-y divide-white/[0.06]">
          {branches.map((b) => (
            <div key={b.id} className="flex items-center gap-3 p-4">
              <IconBubble tone="blue"><FileText size={17} /></IconBubble>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{b.name}</div>
                <div className="text-xs text-ink-faint mt-0.5">
                  {(b.devices || []).filter((d) => d.online).length} of {(b.devices || []).length} online
                </div>
              </div>
              <div className="w-24 lg:w-40 h-2 rounded-full bg-white/[0.06] overflow-hidden hidden sm:block" aria-hidden="true">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-sky-400" style={{ width: `${Math.round(((b.salesToday || 0) / Math.max(1, ...branches.map((x) => x.salesToday || 0))) * 100)}%` }} />
              </div>
              <div className="text-lg font-bold tabular-nums w-10 text-right">{b.salesToday ?? 0}</div>
            </div>
          ))}
        </Card>
      )}

      <p className="text-xs text-ink-faint mt-5 px-1 leading-relaxed">
        Read only. Nothing here changes what is on a branch&rsquo;s computer.
      </p>
    </div>
  );
}
