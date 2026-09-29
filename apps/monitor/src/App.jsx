import React, { useCallback, useEffect, useState } from "react";
import { Monitor, RefreshCw } from "lucide-react";
import { api } from "./api";
import { session } from "./session";
import { notifyNewActivity, notifyNewSales, notifyReminders, requestPermission } from "./notify";
import BottomNav, { SideNav, ThemeButton } from "./components/BottomNav";
import { Backdrop } from "./components/ui";
import Tour, { tourDone } from "./components/Tour";
import LoginScreen from "./screens/LoginScreen";
import HomeScreen from "./screens/HomeScreen";
import DevicesScreen from "./screens/DevicesScreen";
import BranchScreen from "./screens/BranchScreen";
import ReportsScreen from "./screens/ReportsScreen";
import SettingsScreen from "./screens/SettingsScreen";

// Often enough that the dashboard feels live when an owner is watching it,
// rare enough not to eat a data bundle sitting in a pocket.
const REFRESH_MS = 60_000;

export default function App() {
  const [token, setToken] = useState(undefined);   // undefined = still looking
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("home");
  const [branch, setBranch] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [touring, setTouring] = useState(false);

  useEffect(() => {
    session.get().then((t) => setToken(t || null));
  }, []);

  const load = useCallback(async (t, { quiet = false } = {}) => {
    if (!t) return;
    if (!quiet) setRefreshing(true);
    const res = await api.summary(t);
    setRefreshing(false);

    if (res.ok) {
      setData(res);
      setUpdatedAt(Date.now());
      setError("");
      // Anything in the feed this phone has not seen becomes a notification.
      // Deliberately not awaited: a slow or refused notification must never
      // hold up the numbers appearing on screen.
      const detailed = Array.isArray(res.recentSales);
      notifyNewActivity(res.activity, { skipSales: detailed }).catch(() => {});
      if (detailed) notifyNewSales(res.recentSales).catch(() => {});
      notifyReminders(res.owed, res.uncollected).catch(() => {});
      return;
    }
    // The session ended -- expired, or signed out from elsewhere. Clearing it
    // sends them to the sign-in screen instead of leaving a dead app that
    // refreshes into nothing.
    if (res.error === "no_session") {
      await session.clear();
      setToken(null);
      setData(null);
      return;
    }
    // Anything else, including being offline: keep showing what is already on
    // screen. Stale numbers are more use to a shop owner than an error page.
    setError(res.message || "Couldn't refresh just now.");
  }, []);

  // Asked once we know who they are, not on the splash screen -- a
  // permission prompt before the app has shown what it does is the one most
  // people refuse.
  useEffect(() => {
    if (!token) return;
    requestPermission().catch(() => {});
  }, [token]);

  // The tour, once, the first time there's a dashboard to show round.
  useEffect(() => {
    if (!data || tourDone()) return undefined;
    const t = setTimeout(() => setTouring(true), 900);
    return () => clearTimeout(t);
  }, [data]);

  useEffect(() => {
    if (!token) return;
    load(token);
    const id = setInterval(() => load(token, { quiet: true }), REFRESH_MS);
    return () => clearInterval(id);
  }, [token, load]);

  if (token === undefined) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="w-14 h-14 rounded-2xl grid place-items-center bg-ink animate-pulse">
          <Monitor className="text-ground" size={26} />
        </div>
      </div>
    );
  }

  if (token === null) {
    return (
      <div className="relative min-h-screen">
        <Backdrop />
        <div className="relative z-10">
          <LoginScreen
            onSignedIn={async (t) => {
              await session.set(t);
              setToken(t);
            }}
          />
        </div>
      </div>
    );
  }

  async function signOut() {
    await api.logout(token);
    await session.clear();
    setToken(null);
    setData(null);
    setTab("home");
    setBranch(null);
  }

  function openBranch(branchId) {
    const found = (data?.branches || []).find((b) => b.id === branchId);
    if (found) setBranch(found);
  }

  function go(next) {
    setBranch(null);
    setTab(next);
    window.scrollTo({ top: 0 });
  }

  const screen = branch ? (
    <BranchScreen token={token} branch={branch} onBack={() => setBranch(null)} />
  ) : tab === "home" ? (
    <HomeScreen data={data} updatedAt={updatedAt} onOpenBranch={openBranch} onSeeAll={() => go("devices")} />
  ) : tab === "devices" ? (
    <DevicesScreen data={data} onOpenBranch={openBranch} />
  ) : tab === "reports" ? (
    <ReportsScreen data={data} />
  ) : (
    <SettingsScreen data={data} onSignOut={signOut} onTour={() => { go("home"); setTimeout(() => setTouring(true), 300); }} />
  );

  return (
    // A phone gets one column and a bar at the bottom; a computer gets a
    // sidebar and the full width, laid out as a dashboard rather than a
    // phone screen stretched sideways.
    <div className="relative min-h-screen">
      <Backdrop />
      <SideNav
        tab={tab}
        onChange={go}
        business={data?.business}
        onRefresh={() => load(token)}
        refreshing={refreshing}
        onTour={() => { go("home"); setTimeout(() => setTouring(true), 300); }}
        onSignOut={signOut}
      />

      <div className="relative z-10 lg:pl-64">
        <div className="mx-auto w-full max-w-md lg:max-w-6xl lg:px-6">
          <header className="flex items-center gap-3 px-4 pt-5 pb-4 lg:hidden">
            <div className="w-10 h-10 rounded-xl grid place-items-center bg-ink">
              <Monitor className="text-ground" size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold leading-tight">TechDesk</div>
              <div className="text-xs text-ink-faint truncate">{data?.business?.name || "HQ Monitoring"}</div>
            </div>
            <ThemeButton className="w-10 h-10 rounded-full bg-card border border-line grid place-items-center text-ink-soft" />
            <button
              onClick={() => load(token)}
              aria-label="Refresh"
              className="w-10 h-10 rounded-full bg-card border border-line grid place-items-center text-ink-soft"
            >
              <RefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
            </button>
          </header>
          <div className="hidden lg:block h-8" />

          {error && (
            <p className="mx-4 mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-xs">
              {error} Showing the last update.
            </p>
          )}

          {/* Clears the floating nav on a phone, plus the gesture bar underneath it. */}
          <main key={branch ? `b-${branch.id}` : tab} className="m-fade pb-[calc(112px+env(safe-area-inset-bottom))] lg:pb-12">
            {screen}
          </main>
        </div>
      </div>

      {!branch && <BottomNav tab={tab} onChange={go} />}
      {touring && <Tour onDone={() => setTouring(false)} />}
    </div>
  );
}
