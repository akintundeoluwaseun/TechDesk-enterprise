import React, { useState, useEffect, Suspense, lazy } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider, useThemeTokens } from "./lib/ThemeContext";
import { SettingsProvider } from "./lib/SettingsContext";
import { AuthProvider, useAuth, canAccess, homeFor } from "./lib/AuthContext";
import { LicenseProvider } from "./lib/LicenseContext";
import { HelpProvider, useHelp } from "./lib/HelpContext";
import { useAutoBackup } from "./lib/useAutoBackup";
import { useLanSync } from "./lib/useLanSync";
import { findOtherEditions, getMergeDecision, hasLocalRecords } from "./lib/editionData";
import Splash from "./components/Splash";
import LoginScreen from "./pages/LoginScreen";
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
  if (!canAccess(user?.role, path)) {
    return <Navigate to={homeFor(user?.role)} replace />;
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

function Root() {
  const { user } = useAuth();
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
