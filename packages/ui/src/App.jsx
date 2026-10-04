import React, { useState, useEffect, Suspense, lazy } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider, useThemeTokens } from "./lib/ThemeContext";
import { SettingsProvider } from "./lib/SettingsContext";
import { AuthProvider, useAuth, canAccess, homeFor } from "./lib/AuthContext";
import { LicenseProvider } from "./lib/LicenseContext";
import { HelpProvider, useHelp } from "./lib/HelpContext";
import { useAutoBackup } from "./lib/useAutoBackup";
import { useLanSync } from "./lib/useLanSync";
import { useAccountSync } from "./lib/useAccountSync";
import { useSystemAlerts } from "./lib/useSystemAlerts";
import { setAuthorName } from "@techdesk/core";
import { findOtherEditions, getMergeDecision, hasLocalRecords } from "./lib/editionData";
import { getAccountGateDecision, takeRemovedNotice } from "./lib/account";
import Splash from "./components/Splash";
import LoginScreen from "./pages/LoginScreen";
import OnboardingScreen from "./pages/OnboardingScreen";
import Sidebar from "./components/Sidebar";
import MobileNav from "./components/MobileNav";
import MobileAppBar from "./components/MobileAppBar";
import ActivationModal from "./components/ActivationModal";
import { onOpenUpgrade } from "./lib/upgradeModal";
import TutorialModal from "./components/TutorialModal";
import DataMergeModal from "./components/DataMergeModal";
import GuidedTour from "./components/GuidedTour";
import Toaster from "./components/Toaster";
import AmbientGlow from "./components/AmbientGlow";
import WhatsNewModal from "./components/WhatsNewModal";
import AnnouncementModal from "./components/AnnouncementModal";
import { useAnnouncementCheck, markAnnouncementSeen, unseenAnnouncements, appPlatform, appVersion } from "./lib/announcements";
import { useAppControl, updateLink } from "./lib/appControl";
import VoiceOrder, { VOICE_SAVED_EVENT } from "./components/VoiceOrder";
import MorningBrief from "./components/MorningBrief";
import MoneyChaser from "./components/MoneyChaser";
import { onOpenChaser } from "./lib/chaser";
import { onOpenBrief } from "./lib/brief";
import { briefDue, markBriefSeen } from "@techdesk/core";
import { hasUnseenUpdate, markUpdatesSeen, onOpenWhatsNew } from "./lib/whatsNew";
import { isTourPending, markTourDone, markTourPending } from "./lib/tour";
import { useHqSync } from "./lib/useHqSync";
import { onTourRequest } from "./lib/setupTours";
import { pageTourKey, pageTourSeen, markPageTourSeen, pageTourSteps, resetPageTours } from "./lib/pageTours";
import { saleSetupSteps, repairTicketSteps } from "./lib/setupTourSteps";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const SalesPage = lazy(() => import("./pages/SalesPage"));
const RepairsPage = lazy(() => import("./pages/RepairsPage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const ActivityLogsPage = lazy(() => import("./pages/ActivityLogsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

function Guard({ path, children }) {
  const { user } = useAuth();
  if (!canAccess(user, path)) {
    return <Navigate to={homeFor(user)} replace />;
  }
  return children;
}

// Offers to bring data across on the first run of a freshly installed
// edition, when another edition on this device already has records. Asked
// once: the answer is remembered either way. An install that already has its
// own records is left alone -- that owner can still import from
// Settings -> Device if they want to.
function useFirstRunMergePrompt() {
  const [editions, setEditions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    if (getMergeDecision() || hasLocalRecords()) return undefined;
    findOtherEditions()
      .then((found) => {
        if (!cancelled && found.length) setEditions(found);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return [editions, () => setEditions([])];
}

function Shell() {
  const t = useThemeTokens();
  const location = useLocation();
  const { open: helpOpen, dismiss: dismissHelp } = useHelp();
  const [showActivation, setShowActivation] = useState(false);
  // A voice order saved (or undone) behind the page: show it straight away.
  const [voiceTick, setVoiceTick] = useState(0);
  useEffect(() => {
    const bump = () => setVoiceTick((n) => n + 1);
    window.addEventListener(VOICE_SAVED_EVENT, bump);
    return () => window.removeEventListener(VOICE_SAVED_EVENT, bump);
  }, []);
  // A locked control anywhere in the app can open this, without every page
  // having to be handed a callback it does not otherwise care about.
  useEffect(() => onOpenUpgrade(() => setShowActivation(true)), []);
  const [mergeEditions, dismissMerge] = useFirstRunMergePrompt();
  const [touring, setTouring] = useState(() => isTourPending());
  // Once per update, then from the menu whenever they like.
  const [whatsNew, setWhatsNew] = useState(() => hasUnseenUpdate());
  useEffect(() => onOpenWhatsNew(() => setWhatsNew(true)), []);
  function closeWhatsNew() {
    markUpdatesSeen();
    setWhatsNew(false);
  }
  // Messages pushed from the TechDesk console, one at a time.
  const [announcement, setAnnouncement] = useState(null);
  useAnnouncementCheck((a) => setAnnouncement((cur) => cur || a));
  function closeAnnouncement() {
    markAnnouncementSeen(announcement.id);
    setAnnouncement(unseenAnnouncements()[0] || null);
  }
  function finishTour() {
    markTourDone();
    // They've just been shown round; the startup help sheet would only
    // repeat it. Help in the menu still opens it, and can replay the tour.
    dismissHelp(true);
    setTouring(false);
  }
  useAutoBackup();
  useLanSync();
  useHqSync();
  useAccountSync();
  useSystemAlerts();
  // Every sale and job made here carries who made it, so the shop's other
  // devices can say "Ade made a sale" rather than "a sale was made".
  const { user } = useAuth();
  useEffect(() => setAuthorName(user?.name), [user?.name]);

  // The morning brief: once a day, on the first look before 2pm -- also when
  // a phone brings the app back from the background, or a computer left on
  // overnight is used again. Only for someone who sees sales or repairs.
  const [brief, setBrief] = useState(false);
  useEffect(() => onOpenBrief(() => setBrief(true)), []);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "hidden") return;
      if (!(canAccess(user, "/sales") || canAccess(user, "/repairs"))) return;
      try {
        if (briefDue()) setBrief(true);
      } catch {
        // A brief that can't be worked out is not worth stopping the app for.
      }
    };
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [user]);
  // The money chaser opens over everything, from the menu, the brief or the assistant.
  const [chaser, setChaser] = useState(null); // null | {focus}
  useEffect(() => onOpenChaser((focus) => setChaser({ focus })), []);
  function closeBrief() {
    markBriefSeen();
    setBrief(false);
  }

  // One-off tours a page asks for at the moment they're useful: setting up
  // the receipts before the first sale, the ticket after the first repair.
  const navigate = useNavigate();
  const [miniTour, setMiniTour] = useState(null);
  useEffect(
    () =>
      onTourRequest((kind, options) => {
        const desktop = window.matchMedia?.("(min-width: 768px)").matches ?? true;
        if (kind === "sale-setup") {
          // Staff who can't open Settings can't change what it would show them.
          if (!canAccess(user, "/settings")) {
            navigate("/sales?new=1");
            return;
          }
          setMiniTour({
            key: `sale-${Date.now()}`,
            steps: saleSetupSteps({ desktop }),
            finale: {
              title: "Your receipts are ready",
              body: "Your shop name and signature now go on every receipt and repair ticket. Let's make that sale.",
              button: "Make my first sale",
            },
            // Back where they started, with the sale they meant to make open.
            done: () => navigate("/sales?new=1"),
          });
        } else if (kind === "repair-ticket" && options.repairId) {
          setMiniTour({
            key: `ticket-${options.repairId}`,
            steps: repairTicketSteps({ desktop, repairId: options.repairId, ticketLabel: options.ticketLabel || "repair ticket" }),
            finale: null,
            done: () => {},
          });
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user]
  );
  // The first time each page (or Settings tab) is opened: a short tour of
  // how to use it. Never on top of another tour or window, and never while
  // the welcome tour is still to come.
  useEffect(() => {
    if (touring || miniTour || showActivation || whatsNew || announcement || brief || mergeEditions.length > 0) return undefined;
    const key = pageTourKey(location.pathname, location.search);
    if (!key || pageTourSeen(key)) return undefined;
    const id = setTimeout(() => {
      const desktop = window.matchMedia?.("(min-width: 768px)").matches ?? true;
      const steps = pageTourSteps(key, { desktop }).filter(
        (s) => !s.target || document.querySelector(`[data-tour="${s.target}"]`),
      );
      if (!steps.length) return;
      markPageTourSeen(key);
      setMiniTour({ key: `page-${key}`, steps, finale: null, done: () => {} });
    }, 900);
    return () => clearTimeout(id);
  }, [location.pathname, location.search, touring, miniTour, showActivation, whatsNew, announcement, brief, mergeEditions.length]);

  function finishMiniTour() {
    const t = miniTour;
    setMiniTour(null);
    t?.done?.();
  }

  return (
    <div className={`min-h-screen w-full flex ${t.bg}`}>
      <AmbientGlow dark={t.dark} />
      <Sidebar onOpenActivation={() => setShowActivation(true)} />
      <MobileNav />
      <div className="flex-1 relative pb-16 md:pb-0 min-w-0">
        <MobileAppBar onOpenActivation={() => setShowActivation(true)} />
        <Suspense fallback={null}>
          {/* Keyed on the page, so every move between pages plays the entrance. */}
          <div key={`${location.pathname}#${voiceTick}`} className="td-page">
          <Routes>
            <Route path="/" element={<Guard path="/"><DashboardPage /></Guard>} />
            <Route path="/sales" element={<Guard path="/sales"><SalesPage /></Guard>} />
            <Route path="/repairs" element={<Guard path="/repairs"><RepairsPage /></Guard>} />
            <Route path="/inventory" element={<Guard path="/inventory"><InventoryPage /></Guard>} />
            <Route path="/customers" element={<Guard path="/customers"><CustomersPage /></Guard>} />
            <Route path="/reports" element={<Guard path="/reports"><ReportsPage /></Guard>} />
            <Route path="/activity" element={<Guard path="/activity"><ActivityLogsPage /></Guard>} />
            <Route path="/settings" element={<Guard path="/settings"><SettingsPage /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </div>
        </Suspense>
      </div>
      <Toaster />
      <VoiceOrder />
      {chaser && canAccess(user, "/sales") && <MoneyChaser focusKey={chaser.focus} onClose={() => setChaser(null)} />}
      {showActivation && <ActivationModal onClose={() => setShowActivation(false)} />}
      {mergeEditions.length > 0 ? (
        <DataMergeModal editions={mergeEditions} onClose={dismissMerge} />
      ) : miniTour ? (
        <GuidedTour
          key={miniTour.key}
          steps={miniTour.steps}
          start={null}
          finale={miniTour.finale}
          skipLabel="Not now"
          onFinish={finishMiniTour}
        />
      ) : touring ? (
        !showActivation && <GuidedTour onFinish={finishTour} />
      ) : whatsNew ? (
        <WhatsNewModal onClose={closeWhatsNew} />
      ) : announcement ? (
        <AnnouncementModal announcement={announcement} onClose={closeAnnouncement} />
      ) : brief ? (
        <MorningBrief onClose={closeBrief} />
      ) : (
        helpOpen && (
          <TutorialModal
            onClose={dismissHelp}
            onStartTour={() => {
              // A replay also brings back each page's own quick tour.
              resetPageTours();
              dismissHelp(false);
              setTouring(true);
            }}
          />
        )
      )}
    </div>
  );
}

// "Sign in to sync data, or continue locally" -- asked once, on a device's
// very first run, and never again once answered. A device that already has
// records of its own predates this feature (or was already answered by
// choosing to sign in, which stores its own decision above) -- either way it
// is not a fresh install, and interrupting an already-running shop with this
// is exactly the surprise this check exists to avoid.
function useFirstRunAccountGate() {
  const [show, setShow] = useState(() => !getAccountGateDecision() && !hasLocalRecords());
  return [show, () => setShow(false)];
}

// Shown once, on the launch after the shop removed this worker's device and
// it cleared itself (useAccountSync) -- otherwise it would simply come back
// as a blank new install with no word of why.
function RemovedNotice() {
  const [show, setShow] = useState(() => takeRemovedNotice());
  if (!show) return null;
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[2147483001] flex justify-center p-3">
      <div className="max-w-md w-full rounded-2xl bg-neutral-900/95 text-white px-4 py-3 shadow-xl flex gap-3 items-start">
        <p className="text-sm leading-snug flex-1">
          <strong className="block">You were removed from the shop</strong>
          The shop owner removed this device, so its copy of the shop's records was cleared. Ask them for a new code to join again.
        </p>
        <button type="button" onClick={() => setShow(false)} className="text-sm font-semibold underline underline-offset-2">
          OK
        </button>
      </div>
    </div>
  );
}

// What the owner's console says for every app at once: a version too old to
// keep using, and a maintenance notice. Above everything, on every screen,
// the sign-in screen included.
function AppControlLayer() {
  const control = useAppControl();
  const notice = control?.maintenance?.message || "";
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem("techdesk_maintenance_hidden") || ""; } catch { return ""; }
  });
  function hide() {
    setHidden(notice);
    try { sessionStorage.setItem("techdesk_maintenance_hidden", notice); } catch { /* private mode */ }
  }

  if (control?.updateRequired) {
    const web = appPlatform() === "web";
    return (
      <div role="alertdialog" aria-modal="true" aria-labelledby="td-update-title" className="fixed inset-0 z-[2147483002] flex items-center justify-center bg-neutral-950/95 p-6">
        <div className="max-w-sm w-full rounded-2xl bg-white text-neutral-900 p-6 text-center shadow-2xl">
          <img src="./icon-192.png" alt="" className="w-14 h-14 rounded-2xl mx-auto mb-4" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <h2 id="td-update-title" className="text-lg font-bold mb-2">Please update TechDesk</h2>
          <p className="text-sm text-neutral-600 mb-5">
            This version ({appVersion()}) is too old to keep using{control.minVersion ? `. Version ${control.minVersion} or newer is needed` : ""}.
            Your records are safe on this device and will be there after the update.
          </p>
          {web ? (
            <button type="button" onClick={() => window.location.reload()} className="w-full py-3 rounded-xl bg-neutral-900 text-white font-semibold">
              Reload to update
            </button>
          ) : (
            <a href={updateLink()} target="_blank" rel="noopener noreferrer" className="block w-full py-3 rounded-xl bg-neutral-900 text-white font-semibold">
              Download the update
            </a>
          )}
        </div>
      </div>
    );
  }

  if (!notice || hidden === notice) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[2147483000] flex justify-center p-2 pointer-events-none">
      <div className="pointer-events-auto max-w-xl w-full rounded-xl bg-amber-400 text-amber-950 px-4 py-2.5 shadow-lg flex gap-3 items-center">
        <p className="text-sm leading-snug flex-1"><strong>Heads up:</strong> {notice}</p>
        <button type="button" onClick={hide} className="text-sm font-semibold underline underline-offset-2 shrink-0">OK</button>
      </div>
    </div>
  );
}

function Root() {
  return (
    <>
      <RemovedNotice />
      <AppControlLayer />
      <RootScreen />
    </>
  );
}

function RootScreen() {
  const { user } = useAuth();
  const [showGate, dismissGate] = useFirstRunAccountGate();
  if (showGate) {
    return (
      <OnboardingScreen
        onDone={() => {
          markTourPending();
          // A brand-new shop gets the welcome and the tour; "what changed
          // since last time" means nothing to them yet.
          markUpdatesSeen();
          dismissGate();
        }}
      />
    );
  }
  if (!user) return <LoginScreen />;
  return <Shell />;
}

export default function App() {
  const [showSplash, setShowSplash] = React.useState(true);

  return (
    <ThemeProvider>
      <SettingsProvider>
        <LicenseProvider>
          <AuthProvider>
            <HelpProvider>
              <HashRouter>
                {showSplash ? (
                  <Splash onDone={() => setShowSplash(false)} />
                ) : (
                  <Root />
                )}
              </HashRouter>
            </HelpProvider>
          </AuthProvider>
        </LicenseProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
