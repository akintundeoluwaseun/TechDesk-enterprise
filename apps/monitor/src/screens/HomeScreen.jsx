import React from "react";
import {
  Monitor, Wrench, FileText, Bell, ChevronRight, CheckCircle2,
  AlertTriangle, Info, Package, Wallet, PackageCheck, Phone,
} from "lucide-react";
import { Card, Empty, IconBubble, SectionHeader, StatTile, StatusDot } from "../components/ui";
import { ago, firstName, greeting, time } from "../format";
import { money } from "../currency";

const ACTIVITY_LOOK = {
  sale: { tone: "green", Icon: CheckCircle2 },
  repair: { tone: "blue", Icon: Wrench },
  inventory: { tone: "amber", Icon: Package },
  customer: { tone: "violet", Icon: Info },
  alert: { tone: "red", Icon: AlertTriangle },
};

export default function HomeScreen({ data, onOpenBranch, onSeeAll }) {
  const stats = data?.stats || {};
  const branches = data?.branches || [];
  const activity = data?.activity || [];
  const owner = firstName(data?.business?.ownerName);
  const owed = data?.owed || [];
  const uncollected = data?.uncollected || [];
  const sales = data?.recentSales || [];
  // Who owes and who hasn't collected, oldest first -- the list an owner
  // rings round from.
  const chase = [
    ...owed.map((o) => ({ ...o, key: `o:${o.id}`, kind: "owed" })),
    ...uncollected.map((u) => ({ ...u, key: `u:${u.id}`, kind: "uncollected" })),
  ].sort((a, b) => new Date(a.since) - new Date(b.since));

  // Flattened, because an owner thinks in shops-and-machines, not in a tree.
  const devices = branches.flatMap((b) =>
    (b.devices || []).map((d) => ({ ...d, branchName: b.name, branchId: b.id })),
  );

  return (
    <div className="px-4">
      <h1 className="text-2xl font-bold">
        {greeting()}{owner ? `, ${owner}` : ""}
      </h1>
      <p className="text-ink-soft mt-1 mb-5">Here&rsquo;s what&rsquo;s happening across your branches.</p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatTile
          tone="green"
          icon={<Monitor size={19} />}
          value={stats.connectedDevices ?? 0}
          label="Connected Devices"
        />
        <StatTile
          tone="blue"
          icon={<Wrench size={19} />}
          value={stats.openRepairs ?? 0}
          label="Open Repairs"
        />
        <StatTile
          tone="violet"
          icon={<FileText size={19} />}
          value={stats.salesToday ?? 0}
          label="Sales Today"
        />
        <StatTile
          tone="red"
          icon={<Bell size={19} />}
          value={(stats.lowStock ?? 0) + (stats.devicesNeedingAttention ?? 0) + chase.length}
          label="Needs Attention"
        />
      </div>

      {chase.length > 0 && (
        <section className="mb-6">
          <SectionHeader icon={<AlertTriangle size={17} />} title="Needs a look" />
          <Card className="divide-y divide-slate-100">
            {chase.slice(0, 6).map((c) => (
              <div key={c.key} className="flex items-center gap-3 p-4">
                <IconBubble tone={c.kind === "owed" ? "amber" : "violet"}>
                  {c.kind === "owed" ? <Wallet size={17} /> : <PackageCheck size={17} />}
                </IconBubble>
                <div className="flex-1 min-w-0">
                  <div className="font-medium leading-snug">
                    {c.kind === "owed"
                      ? `${c.customer || "A customer"} owes ${money(Number(c.amount) || 0)}`
                      : `${c.customer || "A customer"} hasn't collected their ${c.device || "device"}`}
                  </div>
                  <div className="text-xs text-ink-faint mt-0.5 truncate">
                    {[c.kind === "owed" ? `Unpaid · ${ago(c.since)}` : `Ready · ${ago(c.since)}`, c.branch, c.number].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {c.phone && (
                  <a href={`tel:${c.phone}`} aria-label={`Call ${c.customer || "customer"}`} className="w-9 h-9 rounded-full bg-card shadow-raised-sm grid place-items-center text-blue-500 shrink-0">
                    <Phone size={16} />
                  </a>
                )}
              </div>
            ))}
          </Card>
          {chase.length > 6 && <p className="text-xs text-ink-faint mt-2 px-1">and {chase.length - 6} more</p>}
        </section>
      )}

      {sales.length > 0 && (
        <section className="mb-6">
          <SectionHeader icon={<FileText size={17} />} title="Latest Sales" />
          <Card className="divide-y divide-slate-100">
            {sales.slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <IconBubble tone="green"><CheckCircle2 size={17} /></IconBubble>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {s.by || "Someone"}{s.branch ? ` · ${s.branch}` : ""}
                  </div>
                  <div className="text-xs text-ink-faint mt-0.5 truncate">
                    {[s.firstItem && `${Number(s.firstQty) > 1 ? `${s.firstQty} × ` : ""}${s.firstItem}${s.itemCount > 1 ? ` +${s.itemCount - 1}` : ""}`, s.customer && `to ${s.customer}`, s.paymentStatus && s.paymentStatus !== "Paid" && s.paymentStatus.toLowerCase()].filter(Boolean).join(" · ") || time(s.at)}
                  </div>
                </div>
                <div className="text-sm font-semibold shrink-0 tabular-nums">{money(Number(s.total) || 0)}</div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="mb-6">
        <SectionHeader
          icon={<Monitor size={17} />}
          title="Your Devices"
          action={devices.length > 0 ? <>View all <ChevronRight size={15} /></> : null}
          onAction={onSeeAll}
        />
        {devices.length === 0 ? (
          <Empty
            title="No branches connected yet"
            detail="On a branch's computer, open Settings → Connect to HQ and type this number. They'll ring you for the code."
          />
        ) : (
          <Card className="divide-y divide-slate-100">
            {devices.slice(0, 4).map((d) => (
              <button
                key={d.id}
                onClick={() => onOpenBranch(d.branchId)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <IconBubble tone={d.online ? "green" : "slate"}>
                  <Monitor size={18} />
                </IconBubble>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{d.branchName}</div>
                  {/* The role is what tells two machines in the same shop
                      apart. Without it a branch with a till and a back-office
                      PC shows the same line twice and reads like a bug. */}
                  <div className="text-xs text-ink-soft mt-0.5 truncate">
                    {d.role === "manager" ? "Manager's computer" : "Shop floor"}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusDot online={d.online} />
                    {!d.online && (
                      <span className="text-xs text-ink-faint">{ago(d.lastSeenAt)}</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="text-ink-faint shrink-0" size={18} />
              </button>
            ))}
          </Card>
        )}
      </section>

      <section>
        <SectionHeader icon={<Bell size={17} />} title="Recent Activity" />
        {activity.length === 0 ? (
          <Empty
            title="Nothing yet"
            detail="Sales and repairs from your branches will appear here as they happen."
          />
        ) : (
          <Card className="divide-y divide-slate-100">
            {activity.slice(0, 6).map((a) => {
              const look = ACTIVITY_LOOK[a.type] || ACTIVITY_LOOK.customer;
              return (
                <div key={a.id} className="flex items-center gap-3 p-4">
                  <IconBubble tone={look.tone}><look.Icon size={17} /></IconBubble>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{a.message || "Activity"}</div>
                    {a.branch && <div className="text-xs text-ink-faint mt-0.5">{a.branch}</div>}
                  </div>
                  <div className="text-xs text-ink-faint shrink-0 tabular-nums">{time(a.at)}</div>
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
