import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Bell,
  Sun,
  ChevronDown,
  ChevronRight,
  Power,
  Settings as SettingsIcon,
  Users as UsersIcon,
  HelpCircle,
  X,
  ShoppingCart,
  Wrench,
  Box,
  User,
} from "lucide-react";
import { useTheme, useThemeTokens } from "../lib/ThemeContext";
import { useAuth } from "../lib/AuthContext";
import { useHelp } from "../lib/HelpContext";
import { db } from "../lib/db";

// Matches the colored-circle-icon notification design: one look per
// activity type, real category labels (no fabricated sub-statuses like
// "Repair Completed" vs "Repair Update" -- the message text already says
// what happened).
const NOTIF_STYLES = {
  sale: { Icon: ShoppingCart, label: "New Sale", light: "bg-blue-100 text-blue-600", dark: "bg-blue-500/20 text-blue-400" },
  repair: { Icon: Wrench, label: "Repair Update", light: "bg-emerald-100 text-emerald-600", dark: "bg-emerald-500/20 text-emerald-400" },
  inventory: { Icon: Box, label: "Stock Update", light: "bg-amber-100 text-amber-600", dark: "bg-amber-500/20 text-amber-400" },
  lowstock: { Icon: Box, label: "Low Stock Alert", light: "bg-amber-100 text-amber-600", dark: "bg-amber-500/20 text-amber-400" },
  customer: { Icon: User, label: "New Customer", light: "bg-violet-100 text-violet-600", dark: "bg-violet-500/20 text-violet-400" },
  settings: { Icon: SettingsIcon, label: "Account Update", light: "bg-slate-200 text-slate-600", dark: "bg-slate-500/20 text-slate-400" },
};
const DEFAULT_NOTIF_STYLE = { Icon: Bell, label: "Activity", light: "bg-slate-200 text-slate-600", dark: "bg-slate-500/20 text-slate-400" };

function timeAgo(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diffMin = Math.round(Math.max(0, Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

// Ctrl on Windows/Linux, the Command glyph on a Mac -- shown on the search
// badge and in the shortcuts list so the hint matches the keyboard in front
// of you.
export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
export const MOD_KEY_LABEL = IS_MAC ? "\u2318" : "Ctrl";

export default function Topbar({ title, subtitle, action }) {
  const { toggleDark } = useTheme();
  const t = useThemeTokens();
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();
  const { openHelp } = useHelp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);

  // The badge next to the search box advertised a shortcut that was never
  // actually wired up -- this makes it real.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const [clearedAt, setClearedAt] = useState(() => db.getNotifClearedAt());

  // A single time-ordered feed, same idea as the LAN mobile view: real
  // activity plus low-stock items synthesized in (using the product's own
  // timestamp, since "low stock" is a live state with no event time of its
  // own -- that keeps it from jumping to "just now" on every open).
  const notifFeed = useMemo(() => {
    const activity = db.getActivity();
    const lowStock = db.getInventory().filter((p) => Number(p.stock || 0) <= Number(p.lowStockThreshold || 5));
    const merged = [
      ...activity,
      ...lowStock.map((p) => ({
        type: "lowstock",
        message: `${p.name || "Item"} — only ${p.stock ?? 0} remaining.`,
        createdAt: p.createdAt || p.updatedAt || new Date(0).toISOString(),
      })),
    ];
    merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return merged.slice(0, 8);
  }, [clearedAt]);

  const unreadCount = useMemo(
    () => notifFeed.filter((a) => !clearedAt || new Date(a.createdAt) > new Date(clearedAt)).length,
    [notifFeed, clearedAt]
  );
  const hasAlerts = isAdmin && unreadCount > 0;

  function closeNotifications() {
    setNotifOpen(false);
    db.clearNotifications();
    setClearedAt(db.getNotifClearedAt());
  }

  const searchResults = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    const results = [];
    // Optional-chained throughout: a record from an older backup or a
    // manually edited data file can be missing a field the UI normally
    // guarantees, and one bad record shouldn't crash search for everything.
    db.getSales().forEach((s) => {
      if (s.invoice?.toLowerCase().includes(q) || s.customerName?.toLowerCase().includes(q)) {
        results.push({ type: "Sale", label: `${s.invoice || "Sale"} \u2014 ${s.customerName || "Walk-in"}`, path: "/sales" });
      }
    });
    db.getRepairs().forEach((r) => {
      if (r.ticket?.toLowerCase().includes(q) || r.customerName?.toLowerCase().includes(q) || r.device?.toLowerCase().includes(q)) {
        results.push({ type: "Repair", label: `${r.ticket || "Repair"} \u2014 ${r.device || "Device"}`, path: "/repairs" });
      }
    });
    db.getInventory().forEach((p) => {
      if (p.name?.toLowerCase().includes(q)) {
        results.push({ type: "Product", label: p.name, path: "/inventory" });
      }
    });
    db.getCustomers().forEach((c) => {
      if (c.name?.toLowerCase().includes(q) || c.phone?.includes(q)) {
        results.push({ type: "Customer", label: c.name || c.phone || "Customer", path: "/customers" });
      }
    });
    return results.slice(0, 8);
  }, [query]);

  function goTo(path) {
    setQuery("");
    navigate(path);
  }

  function handlePowerOff() {
    if (window.techdesk?.quit) {
      window.techdesk.quit();
    } else {
      window.close();
    }
  }

  function handleSwitchUser() {
    signOut();
  }

  return (
    <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
      <div>
        <h1 className={`text-3xl font-bold ${t.textPrimary}`}>{title}</h1>
        {subtitle && <p className={`${t.textSecondary} mt-1`}>{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <div className={`flex items-center gap-2 rounded-full px-4 py-2.5 w-64 ${t.cardBg}`}>
            <Search className={`w-4 h-4 ${t.textMuted}`} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search anything..."
              className="bg-transparent outline-none text-sm flex-1 min-w-0"
            />
            {query ? (
              <button onClick={() => setQuery("")} className={t.textMuted}>
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span
                title={`Press ${MOD_KEY_LABEL}+K to search`}
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${
                  t.dark ? "bg-black/20 text-slate-300" : "bg-black/5 text-slate-500"
                }`}
              >
                {MOD_KEY_LABEL}+K
              </span>
            )}
          </div>
          {query && (
            <div className={`absolute top-full mt-2 w-full rounded-xl overflow-hidden z-20 ${t.cardBg}`}>
              {searchResults.length === 0 ? (
                <div className={`px-4 py-3 text-sm ${t.textMuted}`}>No results</div>
              ) : (
                searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(r.path)}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between ${
                      t.dark ? "hover:bg-white/5" : "hover:bg-black/5"
                    }`}
                  >
                    <span className={t.textPrimary}>{r.label}</span>
                    <span className={`text-xs ${t.textMuted}`}>{r.type}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <button onClick={toggleDark} className={`w-10 h-10 rounded-full flex items-center justify-center ${t.cardBg}`}>
          <Sun className={`w-[18px] h-[18px] ${t.textSecondary}`} />
        </button>

        {isAdmin && (
        <div className="relative">
          <button
            onClick={() => {
              setNotifOpen((o) => !o);
              setMenuOpen(false);
            }}
            className={`relative w-10 h-10 rounded-full flex items-center justify-center ${t.cardBg}`}
          >
            <Bell className={`w-[18px] h-[18px] ${t.textSecondary}`} />
            {hasAlerts && <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-blue-500" />}
          </button>
          {notifOpen && (
            <div className={`absolute right-0 top-full mt-2 w-96 rounded-2xl overflow-hidden z-20 shadow-xl ${t.cardBg}`}>
              <div className={`px-4 py-3 flex items-center justify-between border-b ${t.divider}`}>
                <div className="flex items-center gap-2">
                  <Bell className={`w-4 h-4 ${t.textSecondary}`} />
                  <span className={`font-semibold text-sm ${t.textPrimary}`}>Notifications</span>
                  {unreadCount > 0 && (
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        t.dark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-600"
                      }`}
                    >
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <button onClick={closeNotifications} className={t.textMuted}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {notifFeed.length === 0 ? (
                  <div className={`px-4 py-6 text-center text-sm ${t.textMuted}`}>Nothing new</div>
                ) : (
                  notifFeed.map((item, i) => {
                    const style = NOTIF_STYLES[item.type] || DEFAULT_NOTIF_STYLE;
                    const Icon = style.Icon;
                    const isUnread = !clearedAt || new Date(item.createdAt) > new Date(clearedAt);
                    return (
                      <div
                        key={item.id || i}
                        className={`flex gap-3 px-4 py-3 border-b ${t.divider} ${
                          isUnread ? (t.dark ? "bg-blue-500/10" : "bg-blue-50") : ""
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                            t.dark ? style.dark : style.light
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className={`text-sm font-semibold ${t.textPrimary}`}>{style.label}</span>
                            <span className={`text-xs shrink-0 flex items-center gap-1.5 ${t.textMuted}`}>
                              {timeAgo(item.createdAt)}
                              {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                            </span>
                          </div>
                          <p className={`text-xs mt-0.5 ${t.textSecondary}`}>{item.message}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <button
                onClick={() => {
                  setNotifOpen(false);
                  navigate("/activity");
                }}
                className={`w-full px-4 py-3 text-sm font-medium flex items-center justify-center gap-1 ${
                  t.dark ? "text-blue-400 hover:bg-white/5" : "text-blue-600 hover:bg-black/5"
                }`}
              >
                View all notifications <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        )}

        <div className="relative">
          <button
            onClick={() => {
              setMenuOpen((o) => !o);
              setNotifOpen(false);
            }}
            className={`flex items-center gap-1 rounded-full pl-1 pr-2 py-1 ${t.cardBg}`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                t.dark ? "bg-white text-black" : "bg-blue-500 text-white"
              }`}
            >
              {user?.name?.[0] || "A"}
            </div>
            <ChevronDown className={`w-4 h-4 ${t.textMuted}`} />
          </button>
          {menuOpen && (
            <div className={`absolute right-0 top-full mt-2 w-52 rounded-xl overflow-hidden z-20 ${t.cardBg}`}>
              <div className={`px-4 py-3 border-b ${t.divider}`}>
                <div className={`text-sm font-semibold ${t.textPrimary}`}>{user?.name}</div>
                <div className={`text-xs ${t.textMuted}`}>{user?.role}</div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/settings");
                  }}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm ${t.textPrimary} ${
                    t.dark ? "hover:bg-white/5" : "hover:bg-black/5"
                  }`}
                >
                  <SettingsIcon className="w-4 h-4" /> Settings
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  handleSwitchUser();
                }}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm ${t.textPrimary} ${
                  t.dark ? "hover:bg-white/5" : "hover:bg-black/5"
                }`}
              >
                <UsersIcon className="w-4 h-4" /> Switch user
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  openHelp();
                }}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm ${t.textPrimary} ${
                  t.dark ? "hover:bg-white/5" : "hover:bg-black/5"
                }`}
              >
                <HelpCircle className="w-4 h-4" /> Help
              </button>
              <button
                onClick={handlePowerOff}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 ${
                  t.dark ? "hover:bg-white/5" : "hover:bg-black/5"
                }`}
              >
                <Power className="w-4 h-4" /> Power off
              </button>
            </div>
          )}
        </div>

        {action}
      </div>
    </div>
  );
}
