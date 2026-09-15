import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  ShoppingCart,
  Wrench,
  Box,
  Users,
  BarChart3,
  ClipboardList,
  Settings,
  MoreHorizontal,
  Power,
  ShieldCheck,
  ShieldAlert,
  X,
} from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { useAuth, canAccess } from "../lib/AuthContext";
import { useSettings } from "../lib/SettingsContext";
import { useLicense } from "../lib/LicenseContext";

// Phone navigation. The sidebar is a poor fit on a 390px screen -- it either
// eats half the width or collapses to unlabelled icons -- so below `md` it is
// hidden and this takes over: the four things a shop touches all day on the
// bar itself, everything else one tap away under More.
const PRIMARY = [
  { to: "/", label: "Home", icon: LayoutGrid, end: true },
  { to: "/sales", label: "Sales", icon: ShoppingCart },
  { to: "/repairs", label: "Repairs", icon: Wrench },
  { to: "/inventory", label: "Stock", icon: Box },
];

const SECONDARY = [
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/activity", label: "Activity Logs", icon: ClipboardList },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function MobileNav({ onOpenActivation }) {
  const t = useThemeTokens();
  const { settings } = useSettings();
  const { user, signOut } = useAuth();
  const { activated, restricted, daysLeft } = useLicense();
  const [sheetOpen, setSheetOpen] = useState(false);
  const navigate = useNavigate();

  const allowed = (item) => canAccess(user?.role, item.to);
  const label = (item) =>
    item.to === "/repairs" ? settings.labels?.navRepairs || "Repairs" : item.label;

  const primary = PRIMARY.filter(allowed);
  const secondary = SECONDARY.filter(allowed);

  function go(to) {
    setSheetOpen(false);
    navigate(to);
  }

  function handlePowerOff() {
    if (window.techdesk?.quit) window.techdesk.quit();
    else window.close();
  }

  const itemClass = ({ isActive }) =>
    `flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-2 text-[10px] font-medium ${
      isActive ? (t.dark ? "text-white" : "text-blue-600") : t.textMuted
    }`;

  return (
    <>
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setSheetOpen(false)}
          />
          <div className={`relative w-full rounded-t-2xl p-4 pb-6 ${t.cardBg}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0">
                <div className={`text-sm font-semibold truncate ${t.textPrimary}`}>{user?.name}</div>
                <div className={`text-xs ${t.textSecondary}`}>{user?.role}</div>
              </div>
              <button onClick={() => setSheetOpen(false)} className={t.textMuted} aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-1 mb-3">
              {secondary.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.to}
                    onClick={() => go(item.to)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-left ${t.textPrimary}`}
                  >
                    <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
                    {label(item)}
                  </button>
                );
              })}
            </div>

            {!activated && (
              <button
                onClick={() => {
                  setSheetOpen(false);
                  onOpenActivation?.();
                }}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold mb-2 ${
                  restricted ? "bg-red-500 text-white" : t.dark ? "bg-white text-slate-900" : "bg-slate-900 text-white"
                }`}
              >
                {restricted ? <ShieldAlert className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                {restricted ? "Activate" : `Trial: ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
              </button>
            )}

            <div className="flex gap-2">
              <button
                onClick={signOut}
                className={`flex-1 py-3 rounded-xl text-sm font-medium ${t.pillBg} ${t.textPrimary}`}
              >
                Sign out
              </button>
              <button
                onClick={handlePowerOff}
                className={`px-4 py-3 rounded-xl ${t.pillBg} ${t.textPrimary}`}
                aria-label="Close TechDesk"
              >
                <Power className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <nav
        className={`md:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch border-t ${
          t.dark ? "border-white/10" : "border-black/10"
        } ${t.sidebarBg}`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Main"
      >
        {primary.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} end={item.end} className={itemClass}>
              <Icon className="w-5 h-5 shrink-0" strokeWidth={2} />
              <span className="truncate max-w-full px-1">{label(item)}</span>
            </NavLink>
          );
        })}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-2 text-[10px] font-medium ${
            restricted ? "text-red-500" : t.textMuted
          }`}
        >
          <MoreHorizontal className="w-5 h-5 shrink-0" />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
