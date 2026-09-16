import React from "react";
import { FileText, TrendingUp } from "lucide-react";
import { Card, Empty, IconBubble } from "../components/ui";

export default function ReportsScreen({ data }) {
  const branches = data?.branches || [];
  const stats = data?.stats || {};
  const total = branches.reduce((n, b) => n + (b.salesToday || 0), 0);

  return (
    <div className="px-4">
      <h1 className="text-2xl font-bold mb-1">Reports</h1>
      <p className="text-ink-soft mb-5">Today, branch by branch.</p>

      <Card className="p-5 mb-5 flex items-center gap-4">
        <IconBubble tone="violet"><TrendingUp size={19} /></IconBubble>
        <div>
          <div className="text-3xl font-bold leading-none tabular-nums">{stats.salesToday ?? total}</div>
          <div className="text-sm text-ink-soft mt-1.5">sales across every branch today</div>
        </div>
      </Card>

      {branches.length === 0 ? (
        <Empty
          title="Nothing to report yet"
          detail="Once a branch connects and starts selling, its numbers show up here."
        />
      ) : (
        <Card className="divide-y divide-slate-100">
          {branches.map((b) => (
            <div key={b.id} className="flex items-center gap-3 p-4">
              <IconBubble tone="blue"><FileText size={17} /></IconBubble>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{b.name}</div>
                <div className="text-xs text-ink-faint mt-0.5">
                  {(b.devices || []).filter((d) => d.online).length} of {(b.devices || []).length} online
                </div>
              </div>
              <div className="text-lg font-bold tabular-nums">{b.salesToday ?? 0}</div>
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
