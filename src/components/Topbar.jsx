import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, Sun, ChevronDown, Power, Settings as SettingsIcon, Users as UsersIcon, X } from "lucide-react";
import { useTheme, useThemeTokens } from "../lib/ThemeContext";
import { useAuth } from "../lib/AuthContext";
import { db } from "../lib/db";

export default function Topbar({ title, subtitle, action }) {
  const { toggleDark } = useTheme();
  const t = useThemeTokens();
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState("");

  const [clearedAt, setClearedAt] = useState(() => db.getNotifClearedAt());

  const lowStock = useMemo(() => db.getInventory().filter((p) => p.stock <= (p.lowStockThreshold || 5)), []);
  const recentActivity = useMemo(() => {
    const all = db.getActivity();
    const filtered = clearedAt ? all.filter((a) => new Date(a.createdAt) > new Date(clearedAt)) : all;
    return filtered.slice(0, 8);
  }, [clearedAt]);
  const hasAlerts = isAdmin && (lowStock.length > 0 || recentActivity.length > 0);

  function handleClearNotifications() {
    db.clearNotifications();
    setClearedAt(db.getNotifClearedAt());
  }

  const searchResults = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    const results = [];
    db.getSales().forEach((s) => {
      if (s.invoice.toLowerCase().includes(q) || s.customerName?.toLowerCase().includes(q)) {
        results.push({ type: "Sale", label: `${s.invoice} \u2014 ${s.customerName}`, path: "/sales" });
      }
    });
    db.getRepairs().forEach((r) => {
      if (r.ticket.toLowerCase().includes(q) || r.customerName?.toLowerCase().includes(q) || r.device?.toLowerCase().includes(q)) {
        results.push({ type: "Repair", label: `${r.ticket} \u2014 ${r.device}`, path: "/repairs" });
      }
    });
    db.getInventory().forEach((p) => {
      if (p.name.toLowerCase().includes(q)) {
        results.push({ type: "Product", label: p.name, path: "/inventory" });
      }
    });
    db.getCustomers().forEach((c) => {
      if (c.name.toLowerCase().includes(q) || c.phone?.includes(q)) {
        results.push({ type: "Customer", label: c.name, path: "/customers" });
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.dark ? "Search..." : "Search anything..."}
              className="bg-transparent outline-none text-sm flex-1 min-w-0"
            />
            {query ? (
              <button onClick={() => setQuery("")} className={t.textMuted}>
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  t.dark ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-500"
                }`}
              >
                {t.dark ? "/" : "\u2318K"}
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
                      t.dark ? "hover:bg-white/5" : "hover:bg-slate-50"
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
            <div className={`absolute right-0 top-full mt-2 w-72 rounded-xl overflow-hidden z-20 ${t.cardBg}`}>
              <div
                className={`px-4 py-3 flex items-center justify-between text-sm font-semibold ${t.textPrimary} ${
                  t.dark ? "border-b border-white/10" : "border-b border-white/50"
                }`}
              >
                Notifications
                <button onClick={handleClearNotifications} className={`text-xs font-medium ${t.textMuted}`}>
                  Clear
                </button>
              </div>
              {lowStock.length > 0 && (
                <div className="px-4 py-2">
                  <div className="text-xs font-semibold text-orange-500 mb-1">Low stock</div>
                  {lowStock.slice(0, 4).map((p) => (
                    <div key={p.id} className={`text-xs py-1 ${t.textSecondary}`}>
                      {p.name} &mdash; {p.stock} left
                    </div>
                  ))}
                </div>
              )}
              <div className="px-4 py-2 pb-3">
                <div className={`text-xs font-semibold mb-1 ${t.textMuted}`}>Recent activity</div>
                {recentActivity.length === 0 ? (
                  <div className={`text-xs py-2 ${t.textMuted}`}>Nothing new</div>
                ) : (
                  recentActivity.map((a) => (
                    <div key={a.id} className={`text-xs py-1 ${t.textSecondary}`}>
                      {a.message}
                    </div>
                  ))
                )}
              </div>
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
              <div className={`px-4 py-3 ${t.dark ? "border-b border-white/10" : "border-b border-slate-100"}`}>
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
                    t.dark ? "hover:bg-white/5" : "hover:bg-slate-50"
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
                  t.dark ? "hover:bg-white/5" : "hover:bg-slate-50"
                }`}
              >
                <UsersIcon className="w-4 h-4" /> Switch user
              </button>
              <button
                onClick={handlePowerOff}
                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 ${
                  t.dark ? "hover:bg-white/5" : "hover:bg-slate-50"
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
