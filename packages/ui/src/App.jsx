import React, { useState, useEffect, Suspense, lazy } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider, useThemeTokens } from "./lib/ThemeContext";
import { SettingsProvider } from "./lib/SettingsContext";
import { AuthProvider, useAuth, canAccess, homeFor } from "./lib/AuthContext";
import { LicenseProvider } from "./lib/LicenseContext";
import { HelpProvider, useHelp } from "./lib/HelpContext";
import { useAutoBackup } from "./lib/useAutoBackup";
import { useLanSync } from "./lib/useLanSync";
import { useAccountSync } from "./lib/useAccountSync";
import { useOwedReminder } from "./lib/useOwedReminder";
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
import { useHqSync } from "./lib/useHqSync";

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
  const { open: helpOpen, dismiss: dismissHelp } = useHelp();
  const [showActivation, setShowActivation] = useState(false);
  // A locked control anywhere in the app can open this, without every page
  // having to be handed a callback it does not otherwise care about.
  useEffect(() => onOpenUpgrade(() => setShowActivation(true)), []);
  const [mergeEditions, dismissMerge] = useFirstRunMergePrompt();
  useAutoBackup();
  useLanSync();
  useHqSync();
  useAccountSync();
  useOwedReminder();

  return (
    <div className={`min-h-screen w-full flex ${t.bg}`}>
      <Sidebar onOpenActivation={() => setShowActivation(true)} />
      <MobileNav />
      <div className="flex-1 relative pb-16 md:pb-0 min-w-0">
        <MobileAppBar onOpenActivation={() => setShowActivation(true)} />
        <Suspense fallback={null}>
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
        </Suspense>
      </div>
      {showActivation && <ActivationModal onClose={() => setShowActivation(false)} />}
      {mergeEditions.length > 0 ? (
        <DataMergeModal editions={mergeEditions} onClose={dismissMerge} />
      ) : (
        helpOpen && <TutorialModal onClose={dismissHelp} />
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
  if (showGate) return <OnboardingScreen onDone={dismissGate} />;
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
