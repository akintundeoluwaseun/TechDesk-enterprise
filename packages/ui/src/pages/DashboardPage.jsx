import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  Wrench,
  Box,
  CheckCircle2,
  Plus,
  UserPlus,
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";
import Topbar from "../components/Topbar";
import CountUp from "../components/CountUp";
import Sparkline from "../components/Sparkline";
import { useAuth } from "../lib/AuthContext";
import { useThemeTokens } from "../lib/ThemeContext";
import { useSettings } from "../lib/SettingsContext";
import { db } from "../lib/db";
import { money } from "../lib/currency";

function isToday(iso) {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export default function DashboardPage() {
  const t = useThemeTokens();
  const { settings } = useSettings();
  const labels = settings.labels;
  const navigate = useNavigate();

  const { sales, repairs, inventory } = useMemo(
    () => ({ sales: db.getSales(), repairs: db.getRepairs(), inventory: db.getInventory() }),
    []
  );

  const salesToday = sales.filter((s) => isToday(s.createdAt));
  const salesTodayTotal = salesToday.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const inRepair = repairs.filter((r) => r.status !== "completed" && r.status !== "delivered").length;
  const completedToday = repairs.filter(
    (r) => (r.status === "completed" || r.status === "delivered") && isToday(r.createdAt)
  ).length;
  const lowStock = inventory.filter((p) => p.stock <= (p.lowStockThreshold || 5)).length;
  const { user } = useAuth();

  // The last seven days, oldest first -- what the little trend lines draw.
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toDateString();
  });
  const onDay = (iso, day) => new Date(iso).toDateString() === day;
  const salesByDay = days.map((d) => sales.filter((x) => onDay(x.createdAt, d)).reduce((n, x) => n + Number(x.total || 0), 0));
  const repairsByDay = days.map((d) => repairs.filter((r) => onDay(r.createdAt, d)).length);
  const doneByDay = days.map(
    (d) => repairs.filter((r) => (r.status === "completed" || r.status === "delivered") && onDay(r.createdAt, d)).length
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const summary =
    salesToday.length || inRepair
      ? [
          salesToday.length
            ? `${salesToday.length} sale${salesToday.length === 1 ? "" : "s"} today, ${money(salesTodayTotal, settings)} taken`
            : "No sales yet today",
          inRepair ? `${inRepair} ${inRepair === 1 ? labels.ticketSingular.toLowerCase() : labels.ticketPlural.toLowerCase()} on the bench` : null,
        ]
          .filter(Boolean)
          .join(" \u00b7 ")
      : "A fresh day. Ring up your first sale whenever you're ready.";

  const stats = [
    {
      label: "Sales Today",
      value: <CountUp value={salesTodayTotal} format={(n) => money(n, settings)} />,
      sub: `${salesToday.length} transactions`,
      spark: salesByDay,
      sparkColor: "#3b82f6",
      icon: ShoppingCart,
      iconBg: t.dark ? "bg-white/5" : "bg-blue-100",
      iconColor: t.dark ? "text-white" : "text-blue-600",
      onClick: () => navigate("/sales"),
    },
    {
      label: `In ${labels.ticketSingular}`,
      value: <CountUp value={inRepair} />,
      sub: "View all",
      spark: repairsByDay,
      sparkColor: "#10b981",
      icon: Wrench,
      iconBg: t.dark ? "bg-white/5" : "bg-emerald-100",
      iconColor: t.dark ? "text-white" : "text-emerald-600",
      onClick: () => navigate("/repairs"),
    },
    {
      label: "Completed",
      value: <CountUp value={completedToday} />,
      sub: "Today",
      spark: doneByDay,
      sparkColor: "#8b5cf6",
      icon: CheckCircle2,
      iconBg: t.dark ? "bg-white/5" : "bg-violet-100",
      iconColor: t.dark ? "text-white" : "text-violet-600",
      onClick: () => navigate("/repairs"),
    },
    {
      label: "Low Stock",
      value: <CountUp value={lowStock} />,
      sub: "View items",
      icon: Box,
      iconBg: t.dark ? "bg-white/5" : "bg-orange-100",
      iconColor: t.dark ? "text-white" : "text-orange-500",
      onClick: () => navigate("/inventory"),
    },
  ];

  const quickActions = [
    { label: "New Sale (POS)", sub: "Create new sale", icon: ShoppingCart, path: "/sales" },
    { label: `New ${labels.ticketSingular}`, sub: `Create ${labels.ticketSingular.toLowerCase()} ticket`, icon: Wrench, path: "/repairs" },
    { label: "Add Product", sub: "Add to inventory", icon: Plus, path: "/inventory" },
    { label: "Add Customer", sub: "Add new customer", icon: UserPlus, path: "/customers" },
  ];

  const recentRepairs = repairs.slice(0, 3);
  const recentSales = sales.slice(0, 3);

  return (
    <div className="flex-1 p-4 md:p-8">
      <Topbar title="Dashboard" />

      {/* A greeting that knows the time of day and what's happened so far. */}
      <div className="td-rise relative overflow-hidden rounded-3xl bg-neutral-950 text-white px-5 py-6 md:px-8 md:py-8 mb-6">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="td-drift absolute rounded-full" style={{ width: 420, height: 420, left: -140, top: -220, background: "radial-gradient(circle, rgba(99,102,241,.55), transparent 65%)" }} />
          <div className="td-drift-2 absolute rounded-full" style={{ width: 360, height: 360, right: -120, bottom: -220, background: "radial-gradient(circle, rgba(14,165,233,.45), transparent 65%)" }} />
          <div className="td-orbit hidden md:block absolute right-6 md:right-16 top-1/2 -mt-[90px] w-[180px] h-[180px] rounded-full border border-white/10">
            <span className="absolute -top-1 left-1/2 -ml-1 w-2 h-2 rounded-full bg-sky-300 shadow-[0_0_12px_2px_rgba(125,211,252,.8)]" />
          </div>
          <div className="hidden md:block absolute right-[3.25rem] md:right-[6.25rem] top-1/2 -mt-[50px] w-[100px] h-[100px] rounded-full border border-white/10" />
        </div>
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-5">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-sky-300">{today}</div>
            <h2 className="text-2xl md:text-3xl font-bold mt-1.5">
              {greeting}
              {user?.name ? `, ${user.name}` : ""}
            </h2>
            <p className="text-sm md:text-[15px] text-neutral-300 mt-1.5 max-w-xl">{summary}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => navigate("/sales")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold">
              <ShoppingCart className="w-4 h-4" /> New sale
            </button>
            <button onClick={() => navigate("/repairs")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/15">
              <Wrench className="w-4 h-4" /> New {labels.ticketSingular.toLowerCase()}
            </button>
          </div>
        </div>
      </div>

      <div data-tour="dash-stats" className="td-stagger grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5 mb-6">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.label} onClick={s.onClick} className={`td-lift rounded-2xl p-3.5 md:p-5 relative text-left ${t.cardBg}`}>
              <ArrowUpRight className={`absolute top-3.5 right-3.5 md:top-5 md:right-5 w-3.5 h-3.5 md:w-4 md:h-4 ${t.textMuted}`} />
              <div className={`w-9 h-9 md:w-11 md:h-11 rounded-full flex items-center justify-center mb-2.5 md:mb-4 ${s.iconBg}`}>
                <Icon className={`w-[18px] h-[18px] md:w-5 md:h-5 ${s.iconColor}`} />
              </div>
              <div className={`text-[12px] md:text-sm ${t.textSecondary} mb-0.5 md:mb-1`}>{s.label}</div>
              <div className={`text-xl md:text-3xl font-bold ${t.textPrimary} mb-0.5 md:mb-1 truncate`}>{s.value}</div>
              <div className={`text-[11px] md:text-sm ${t.textMuted} truncate pr-16 md:pr-24`}>{s.sub}</div>
              {s.spark && (
                <Sparkline data={s.spark} color={s.sparkColor} className="absolute bottom-3.5 right-3.5 md:bottom-5 md:right-5 w-14 h-7 md:w-20 md:h-9" />
              )}
            </button>
          );
        })}
      </div>

      <div className="td-stagger grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5 mb-6">
        <div className={`rounded-2xl p-4 md:p-6 ${t.cardBg}`}>
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h3 className={`font-semibold ${t.textPrimary}`}>Recent {labels.ticketPlural}</h3>
            <button onClick={() => navigate("/repairs")} className={`text-xs font-medium px-3 py-1.5 rounded-full ${t.pillBg}`}>
              View all
            </button>
          </div>
          {recentRepairs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className={`td-float w-14 h-14 rounded-full flex items-center justify-center mb-4 ${t.dark ? "bg-white/5" : "bg-neutral-100"}`}>
                <Wrench className={`w-6 h-6 ${t.textMuted}`} />
              </div>
              <div className={`font-semibold ${t.textPrimary} mb-1`}>No {labels.ticketPlural.toLowerCase()} yet</div>
              <div className={`text-sm ${t.textMuted}`}>{labels.ticketPlural} will appear here</div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {recentRepairs.map((r) => (
                <button
                  key={r.id}
                  onClick={() => navigate("/repairs")}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-left ${
                    t.dark ? "hover:bg-white/5" : "hover:bg-black/5"
                  }`}
                >
                  <div>
                    <div className={`text-sm font-medium ${t.textPrimary}`}>{r.ticket} &middot; {r.device}</div>
                    <div className={`text-xs ${t.textMuted}`}>{r.customerName}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${t.pillBg}`}>{r.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={`rounded-2xl p-4 md:p-6 ${t.cardBg}`}>
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <h3 className={`font-semibold ${t.textPrimary}`}>Recent Sales</h3>
            <button onClick={() => navigate("/sales")} className={`text-xs font-medium px-3 py-1.5 rounded-full ${t.pillBg}`}>
              View all
            </button>
          </div>
          {recentSales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className={`td-float w-14 h-14 rounded-full flex items-center justify-center mb-4 ${t.dark ? "bg-white/5" : "bg-neutral-100"}`}>
                <ShoppingCart className={`w-6 h-6 ${t.textMuted}`} />
              </div>
              <div className={`font-semibold ${t.textPrimary} mb-1`}>No sales yet</div>
              <div className={`text-sm ${t.textMuted}`}>Sales will appear here</div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {recentSales.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigate("/sales")}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-left ${
                    t.dark ? "hover:bg-white/5" : "hover:bg-black/5"
                  }`}
                >
                  <div>
                    <div className={`text-sm font-medium ${t.textPrimary}`}>{s.invoice}</div>
                    <div className={`text-xs ${t.textMuted}`}>{s.customerName}</div>
                  </div>
                  <span className={`text-sm font-semibold ${t.textPrimary}`}>{money(Number(s.total), settings)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`rounded-2xl p-4 md:p-6 ${t.cardBg}`}>
        <h3 className={`font-semibold ${t.textPrimary} mb-5`}>Quick Actions</h3>
        <div className="td-stagger grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {quickActions.map((qa) => {
            const Icon = qa.icon;
            return (
              <button
                key={qa.label}
                onClick={() => navigate(qa.path)}
                className={`td-lift flex flex-col items-start gap-3 rounded-2xl p-4 text-left ${
                  t.dark ? "bg-white/5 hover:bg-white/10" : "bg-black/5 hover:bg-black/10"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${t.dark ? "bg-white/5" : "bg-blue-100"}`}>
                    <Icon className={`w-5 h-5 ${t.dark ? "text-white" : "text-blue-600"}`} />
                  </div>
                  <ChevronRight className={`w-4 h-4 ${t.textMuted}`} />
                </div>
                <div>
                  <div className={`font-semibold text-sm ${t.textPrimary}`}>{qa.label}</div>
                  <div className={`text-xs ${t.textMuted}`}>{qa.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
