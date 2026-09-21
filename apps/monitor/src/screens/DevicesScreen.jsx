import React from "react";
import { Monitor, ChevronRight, Building2, Unplug } from "lucide-react";
import { Card, Empty, IconBubble, StatusDot } from "../components/ui";
import { ago } from "../format";

export default function DevicesScreen({ data, onOpenBranch }) {
  const branches = data?.branches || [];

  return (
    <div className="px-4">
      <h1 className="text-2xl font-bold mb-1">Branches</h1>
      <p className="text-ink-soft mb-5">Every shop reporting to you.</p>

      {branches.length === 0 ? (
        <Empty
          title="No branches yet"
          detail="Each branch connects from its own computer: Settings → Connect to HQ, then your phone number."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {branches.map((b) => (
            <Card key={b.id} className="overflow-hidden">
              <button
                onClick={() => onOpenBranch(b.id)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <IconBubble tone="blue"><Building2 size={18} /></IconBubble>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{b.name}</div>
                  <div className="text-xs text-ink-faint mt-0.5">
                    {b.salesToday ?? 0} sale{(b.salesToday ?? 0) === 1 ? "" : "s"} today
                  </div>
                </div>
                <ChevronRight className="text-ink-faint shrink-0" size={18} />
              </button>

              {/* A branch with nothing connected said nothing at all: the card
                  showed the name and the sales and stopped, which reads as
                  "fine". A shop that had just disconnected a device looked
                  here and saw no difference. */}
              {(b.devices || []).length === 0 && (
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/60 flex items-center gap-3">
                  <Unplug className="text-ink-faint shrink-0" size={16} />
                  <div className="text-sm text-ink-faint">
                    Nothing connected here. Connect TechDesk on the shop's computer or phone.
                  </div>
                </div>
              )}

              {(b.devices || []).length > 0 && (
                <div className="border-t border-slate-100 divide-y divide-slate-100">
                  {b.devices.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 px-4 py-3 bg-slate-50/60">
                      <Monitor className="text-ink-faint shrink-0" size={16} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          {d.role === "manager" ? "Manager's computer" : "Shop floor"}
                          {d.edition ? ` · ${d.edition}` : ""}
                        </div>
                        <div className="text-xs text-ink-faint mt-0.5">
                          {d.online ? "Reporting in" : `Last seen ${ago(d.lastSeenAt)}`}
                        </div>
                      </div>
                      <StatusDot online={d.online} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
