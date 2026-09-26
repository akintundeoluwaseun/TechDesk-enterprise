import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutGrid,
  ShoppingCart,
  Wrench,
  Box,
  Users,
  BarChart3,
  ClipboardList,
  Settings,
  Power,
  Monitor,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { IS_ANDROID_APP } from "../lib/platform";
import { useAuth, canAccess } from "../lib/AuthContext";
import { useSettings } from "../lib/SettingsContext";
import { useLicense } from "../lib/LicenseContext";
import { tierLabel } from "../lib/tier";
import SyncStatus from "./SyncStatus";

const NAV_ITEMS_BASE = [
  { to: "/", label: "Dashboard", icon: LayoutGrid, end: true },
  { to: "/sales", label: "Sales (POS)", icon: ShoppingCart },
  { to: "/repairs", label: null, icon: Wrench }, // label filled from settings.labels.navRepairs
  { to: "/inventory", label: "Inventory", icon: Box },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/activity", label: "Activity Logs", icon: ClipboardList },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar({ onOpenActivation }) {
  const t = useThemeTokens();
  const { settings } = useSettings();
  const { user, signOut } = useAuth();
  const { tier } = useLicense();
  // What this shop has, not how long until it stops working -- nothing stops
  // working any more. On the free tier this is an offer, and it is the only
  // place a shop that never opens Settings finds out there is more; on a paid
  // tier it is a receipt for what they bought.
  const onFree = tier === "free";
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("techdesk_sidebar_collapsed") === "1");

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("techdesk_sidebar_collapsed", !c ? "1" : "0");
      return !c;
    });
  }

  const visibleItems = NAV_ITEMS_BASE.filter((item) => canAccess(user?.role, item.to)).map((item) =>
    item.to === "/repairs" ? { ...item, label: settings.labels?.navRepairs || "Repairs" } : item
  );

  function handlePowerOff() {
    if (window.techdesk?.quit) {
      window.techdesk.quit();
    } else {
      window.close();
    }
  }

  return (
    <aside
      className={`shrink-0 hidden md:flex flex-col justify-between p-3 h-screen sticky top-0 transition-all duration-200 ${
        collapsed ? "w-[72px]" : "w-60"
      } ${t.sidebarBg}`}
    >
      <div>
        <div className="flex items-center justify-between px-1 pt-2 pb-1">
          <div className="flex items-center gap-2 min-w-0">
            <Monitor className={`w-5 h-5 shrink-0 ${t.dark ? "text-white" : "text-blue-500"}`} />
            {!collapsed && (
              <span className={`text-base font-bold truncate ${t.textPrimary}`}>{settings.shopName}</span>
            )}
          </div>
        </div>
        {!collapsed && (
          <div className={`px-1 pb-3 text-[11px] tracking-wide font-medium truncate ${t.textMuted}`}>
            {settings.tagline}
          </div>
        )}

        <button
          onClick={toggleCollapsed}
          className={`flex items-center gap-2 px-3 py-1.5 mb-2 rounded-xl text-xs font-medium ${t.pillBg} ${
            collapsed ? "justify-center w-full" : ""
          }`}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4" /> Collapse</>}
        </button>

        <nav className="flex flex-col gap-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    collapsed ? "justify-center" : ""
                  } ${
                    isActive
                      ? t.dark
                        ? "bg-slate-800 text-white"
                        : "bg-blue-50 text-blue-600"
                      : t.dark
                      ? "text-slate-300 hover:bg-white/5"
                      : "text-slate-600 hover:bg-black/5"
                  }`
                }
              >
                <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
                {!collapsed && item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-2">
        {/* Above the upgrade button, because it is about the shop as it is
            rather than what it could buy. Draws nothing at all on a device
            that is part of no shop. */}
        <SyncStatus collapsed={collapsed} />

        <button
          onClick={onOpenActivation}
          title={collapsed ? (onFree ? "See what upgrading adds" : tierLabel(tier)) : undefined}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold ${
            onFree
              ? t.dark ? "bg-white text-slate-900" : "bg-slate-900 text-white"
              : t.pillBg
          }`}
        >
          <ShieldCheck className="w-4 h-4 shrink-0" />
          {!collapsed && (onFree ? "Upgrade" : tierLabel(tier))}
        </button>

        <div
          className={`flex items-center gap-2 rounded-xl p-2.5 ${collapsed ? "flex-col" : "justify-between"} ${t.cardBg}`}
        >
          <div className={`flex items-center gap-3 min-w-0 ${collapsed ? "flex-col" : ""}`}>
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${
                t.dark ? "bg-white text-black" : "bg-blue-100 text-blue-600"
              }`}
            >
              {user?.name?.[0] || "A"}
            </div>
            {!collapsed && (
              <div className="text-left min-w-0">
                <div className={`text-sm font-semibold truncate ${t.textPrimary}`}>{user?.name}</div>
                <div className={`text-xs ${t.textSecondary}`}>{user?.role}</div>
              </div>
            )}
          </div>
          {/* Not on a phone -- at any width.
              This sidebar is hidden below the md breakpoint, which is a
              width, not a device. Turn a phone on its side and it is wide
              enough: the desktop sidebar appears, and with it a switch-user
              button and a power-off button on a shell that has neither
              staff accounts nor an app to quit. Android owns quitting, and
              the Users tab was removed from the phone for the same reason
              it should never have been offered here.

              Which is the lesson from the Users tab repeated: a breakpoint
              answers "how much room is there", never "which app is this". */}
          {!IS_ANDROID_APP && (
            <div className={`flex items-center gap-1 ${collapsed ? "flex-col" : ""}`}>
              <button onClick={signOut} title="Switch user" className={`p-1.5 rounded-lg ${t.textMuted}`}>
                <Users className="w-4 h-4" />
              </button>
              <button onClick={handlePowerOff} title="Power off" className="p-1.5 rounded-lg text-red-500">
                <Power className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
