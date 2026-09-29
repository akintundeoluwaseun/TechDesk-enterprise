import React, { useEffect, useState } from "react";
import {
  Monitor, Wrench, FileText, Bell, ChevronRight, CheckCircle2,
  AlertTriangle, Info, Package, Wallet, PackageCheck, Phone, ShoppingBag,
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

/** "Updated 12s ago", ticking, so the owner can see it is live. */
function Live({ at }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);
  const secs = at ? Math.max(0, Math.round((Date.now() - at) / 1000)) : null;
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-xs text-neutral-300">
      <span className="w-2 h-2 rounded-full bg-emerald-400 m-live" />
      Live{secs !== null && ` · updated ${secs < 10 ? "just now" : secs < 60 ? `${secs}s ago` : ago(at)}`}
    </span>
  );
}

function itemLine(s) {
  if (!s.firstItem) return null;
  return `${Number(s.firstQty) > 1 ? `${s.firstQty} × ` : ""}${s.firstItem}${s.itemCount > 1 ? ` +${s.itemCount - 1}` : ""}`;
}

export default function HomeScreen({ data, updatedAt, onOpenBranch, onSeeAll }) {
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
  const owedTotal = owed.reduce((n, o) => n + (Number(o.amount) || 0), 0);
  const takings = sales.reduce((n, s) => n + (Number(s.total) || 0), 0);

  // Flattened, because an owner thinks in shops-and-machines, not in a tree.
  const devices = branches.flatMap((b) =>
    (b.devices || []).map((d) => ({ ...d, branchName: b.name, branchId: b.id })),
  );

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="px-4 lg:px-0">
      {/* The banner: who, when, and the one sentence that matters today.
          Dark in both themes, like the TechDesk app's own dashboard banner. */}
      <section className="m-rise relative overflow-hidden rounded-2xl bg-neutral-950 text-white p-6 lg:p-8 mb-5">
        <div aria-hidden="true" className="m-glow !absolute" style={{ width: 420, height: 420, left: -140, top: -220, background: "radial-gradient(circle, rgba(99,102,241,0.32), transparent 65%)" }} />
        <div aria-hidden="true" className="m-glow !absolute" style={{ width: 380, height: 380, right: -120, bottom: -220, background: "radial-gradient(circle, rgba(14,165,233,0.22), transparent 65%)", animationDelay: "-8s" }} />
        <div className="relative flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-neutral-400 mb-2">{today}</div>
            <h1 className="text-[28px] lg:text-4xl font-bold leading-tight">
              {greeting()}{owner ? `, ${owner}` : ""}
            </h1>
            <p className="text-neutral-400 mt-2 max-w-xl">
              {stats.salesToday ?? 0} sale{(stats.salesToday ?? 0) === 1 ? "" : "s"} today across {branches.length} branch{branches.length === 1 ? "" : "es"}
              {takings > 0 ? `, ${money(takings)} in the last day` : ""}
              {owedTotal > 0 ? `, and ${money(owedTotal)} still owed.` : "."}
            </p>
          </div>
          <Live at={updatedAt} />
        </div>
      </section>

      <div data-tour="stats" className="m-stagger grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatTile tone="green" icon={<Monitor size={19} />} value={stats.connectedDevices ?? 0} label="Devices online" />
        <StatTile tone="blue" icon={<Wrench size={19} />} value={stats.openRepairs ?? 0} label="Open repairs" />
        <StatTile tone="violet" icon={<FileText size={19} />} value={stats.salesToday ?? 0} label="Sales today" />
        <StatTile
          tone="red"
          icon={<Bell size={19} />}
          value={(stats.lowStock ?? 0) + (stats.devicesNeedingAttention ?? 0) + chase.length}
          label="Need your attention"
        />
      </div>

      <div className="lg:grid lg:grid-cols-[1.25fr_1fr] lg:gap-6 lg:items-start">
        <div>
          {chase.length > 0 && (
            <section data-tour="chase" className="mb-6 m-rise">
              <SectionHeader icon={<AlertTriangle size={17} />} title="Needs a look" count={chase.length} />
              <Card className="divide-y divide-line overflow-hidden">
                {chase.slice(0, 6).map((c) => (
                  <div key={c.key} className="flex items-center gap-3 p-4 hover:bg-ink/[0.03] transition-colors">
                    <IconBubble tone={c.kind === "owed" ? "amber" : "violet"}>
                      {c.kind === "owed" ? <Wallet size={17} /> : <PackageCheck size={17} />}
                    </IconBubble>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium leading-snug">
                        {c.kind === "owed" ? (
                          <>{c.customer || "A customer"} owes <span className="text-amber-600 dark:text-amber-300">{money(Number(c.amount) || 0)}</span></>
                        ) : (
                          `${c.customer || "A customer"} hasn't collected their ${c.device || "device"}`
                        )}
                      </div>
                      <div className="text-xs text-ink-faint mt-0.5 truncate">
                        {[c.kind === "owed" ? `Unpaid · ${ago(c.since)}` : `Ready · ${ago(c.since)}`, c.branch, c.number].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        aria-label={`Call ${c.customer || "customer"}`}
                        className="w-10 h-10 rounded-full grid place-items-center shrink-0 bg-ink/[0.07] text-ink hover:bg-ink/[0.12] transition-colors"
                      >
                        <Phone size={16} />
                      </a>
                    )}
                  </div>
                ))}
              </Card>
              {chase.length > 6 && <p className="text-xs text-ink-faint mt-2 px-1">and {chase.length - 6} more</p>}
            </section>
          )}

          <section data-tour="sales" className="mb-6 m-rise">
            <SectionHeader icon={<ShoppingBag size={17} />} title="Latest sales" count={sales.length} />
            {sales.length === 0 ? (
              <Empty title="No sales in the last day" detail="Each sale your branches make shows up here, with who made it and what they sold." />
            ) : (
              <Card className="divide-y divide-line overflow-hidden">
                {sales.slice(0, 6).map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-4 hover:bg-ink/[0.03] transition-colors">
                    <IconBubble tone="green"><CheckCircle2 size={17} /></IconBubble>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {s.by || "Someone"}
                        {s.branch && <span className="text-ink-faint font-normal"> · {s.branch}</span>}
                      </div>
                      <div className="text-xs text-ink-faint mt-0.5 truncate">
                        {[itemLine(s), s.customer && `to ${s.customer}`, time(s.at)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums">{money(Number(s.total) || 0)}</div>
                      {s.paymentStatus && s.paymentStatus !== "Paid" && (
                        <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-300 mt-0.5">{s.paymentStatus}</div>
                      )}
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </div>

        <div>
          <section data-tour="devices" className="mb-6 m-rise">
            <SectionHeader
              icon={<Monitor size={17} />}
              title="Your devices"
              action={devices.length > 0 ? <>View all <ChevronRight size={15} /></> : null}
              onAction={onSeeAll}
            />
            {devices.length === 0 ? (
              <Empty
                title="No branches connected yet"
                detail="On a branch's computer, open Settings → Connect to HQ and type this number. They'll ring you for the code."
              />
            ) : (
              <Card className="divide-y divide-line overflow-hidden">
                {devices.slice(0, 5).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => onOpenBranch(d.branchId)}
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-ink/[0.04] transition-colors"
                  >
                    <IconBubble tone={d.online ? "green" : "slate"}>
                      <Monitor size={18} />
                    </IconBubble>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{d.branchName}</div>
                      {/* The role is what tells two machines in the same shop
                          apart. Without it a branch with a till and a back-office
                          PC shows the same line twice and reads like a bug. */}
                      <div className="text-xs text-ink-faint mt-0.5 truncate">
                        {d.role === "manager" ? "Manager's computer" : "Shop floor"}
                        {!d.online && ` · ${ago(d.lastSeenAt)}`}
                      </div>
                    </div>
                    <StatusDot online={d.online} />
                    <ChevronRight className="text-ink-faint shrink-0" size={18} />
                  </button>
                ))}
              </Card>
            )}
          </section>

          <section className="m-rise">
            <SectionHeader icon={<Bell size={17} />} title="Recent activity" />
            {activity.length === 0 ? (
              <Empty title="Nothing yet" detail="Sales and repairs from your branches will appear here as they happen." />
            ) : (
              <Card className="divide-y divide-line overflow-hidden">
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
      </div>
    </div>
  );
}
