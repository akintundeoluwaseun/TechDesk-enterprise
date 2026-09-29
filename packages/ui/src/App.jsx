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
import { getAccountGateDecision } from "./lib/account";
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
import { useAnnouncementCheck, markAnnouncementSeen, unseenAnnouncements } from "./lib/announcements";
import { hasUnseenUpdate, markUpdatesSeen, onOpenWhatsNew } from "./lib/whatsNew";
import { isTourPending, markTourDone, markTourPending } from "./lib/tour";
import { useHqSync } from "./lib/useHqSync";
import { onTourRequest } from "./lib/setupTours";
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
          <div key={location.pathname} className="td-page">
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
      ) : (
        helpOpen && (
          <TutorialModal
            onClose={dismissHelp}
            onStartTour={() => {
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

function Root() {
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
