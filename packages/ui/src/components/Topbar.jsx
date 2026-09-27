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
} from "lucide-react";
import { useTheme, useThemeTokens } from "../lib/ThemeContext";
import { useAuth, canAccess } from "../lib/AuthContext";
import { searchEverything } from "../lib/searchAll";
import { notificationFeed, notifStyle, timeAgo, isUnread, unreadCount } from "../lib/notifications";
import { useHelp } from "../lib/HelpContext";
import { db } from "../lib/db";

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

  // The same feed the phone's app bar shows, so the two never disagree.
  //
  // clearedAt has to be PASSED, not just depended on. It was in the
  // dependency list and not in the call, so clearing re-ran this and handed
  // back the unfiltered feed every time: the marker moved, the badge went
  // quiet, and every line stayed exactly where it was. From the counter that
  // is a button that does nothing.
  const notifFeed = useMemo(() => notificationFeed(clearedAt), [clearedAt]);
  const unread = unreadCount(notifFeed, clearedAt);
  const hasAlerts = isAdmin && unread > 0;

  // Closing and clearing are separate on purpose. They used to be the same
  // action, so glancing at the bell and shutting it again wiped everything --
  // including whatever you had opened it to go back and read properly.
  function closeNotifications() {
    setNotifOpen(false);
  }

  function clearNotifications() {
    db.clearNotifications();
    setClearedAt(db.getNotifClearedAt());
  }

  const searchResults = useMemo(
    () => searchEverything(query, (path) => canAccess(user, path)),
    [query, user]
  );

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
    <div className="flex items-center justify-between mb-5 md:mb-8 gap-3 md:gap-4 flex-wrap">
      <div>
        <h1 className={`text-[22px] md:text-3xl font-bold leading-tight ${t.textPrimary}`}>{title}</h1>
        {subtitle && <p className={`text-[13px] md:text-base ${t.textSecondary} mt-0.5 md:mt-1`}>{subtitle}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full sm:w-auto">
        {/* On phones these controls live in MobileAppBar instead, so the
            wrapper below is hidden rather than rendering them twice. */}
        <div className="hidden md:flex flex-wrap items-center gap-2 md:gap-3">
        {/* On a phone the search takes its own line -- sharing one with the
            theme, bell, avatar and any page actions crushed it to a circle
            and pushed the page actions off the right edge. */}
        <div className="relative basis-full sm:basis-auto sm:flex-none min-w-0 order-last sm:order-none">
          <div className={`flex items-center gap-2 rounded-full px-4 py-2.5 w-full sm:w-64 ${t.cardBg}`}>
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
                  {unread > 0 && (
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        t.dark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-600"
                      }`}
                    >
                      {unread} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {notifFeed.length > 0 && (
                    <button
                      onClick={clearNotifications}
                      className={`text-xs font-medium px-2.5 py-1 rounded-lg ${t.textSecondary} ${
                        t.dark ? "hover:bg-white/5" : "hover:bg-black/5"
                      }`}
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={closeNotifications}
                    aria-label="Close notifications"
                    className={`p-1 rounded-lg ${t.textMuted} ${
                      t.dark ? "hover:bg-white/5" : "hover:bg-black/5"
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto">
                {notifFeed.length === 0 ? (
                  <div className={`px-4 py-6 text-center text-sm ${t.textMuted}`}>Nothing new</div>
                ) : (
                  notifFeed.map((item, i) => {
                    const style = notifStyle(item.type);
                    const Icon = style.Icon;
                    const fresh = isUnread(item, clearedAt);
                    return (
                      <div
                        key={item.id || i}
                        className={`flex gap-3 px-4 py-3 border-b ${t.divider} ${
                          fresh ? (t.dark ? "bg-blue-500/10" : "bg-blue-50") : ""
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
                              {fresh && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
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

        </div>

        {action}
      </div>
    </div>
  );
}
