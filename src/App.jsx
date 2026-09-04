import React, { useState, Suspense, lazy } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { ThemeProvider, useThemeTokens } from "./lib/ThemeContext";
import { SettingsProvider } from "./lib/SettingsContext";
import { AuthProvider, useAuth, canAccess, homeFor } from "./lib/AuthContext";
import { LicenseProvider, useLicense } from "./lib/LicenseContext";
import { useAutoBackup } from "./lib/useAutoBackup";
import Splash from "./components/Splash";
import LoginScreen from "./pages/LoginScreen";
import Sidebar from "./components/Sidebar";
import RestrictedOverlay from "./components/RestrictedOverlay";
import ActivationModal from "./components/ActivationModal";

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

function ActivateBadge({ onClick }) {
  const t = useThemeTokens();
  const { activated, restricted, daysLeft } = useLicense();
  if (activated) return null;

  return (
    <button
      onClick={onClick}
      className={`fixed top-5 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold shadow-lg ${
        restricted
          ? "bg-red-500 text-white animate-pulse"
          : t.dark
          ? "bg-white text-black"
          : "bg-slate-900 text-white"
      }`}
    >
      {restricted ? <ShieldAlert className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
      {restricted ? "Activate" : `Trial: ${daysLeft}d left`}
    </button>
  );
}

function Shell() {
  const t = useThemeTokens();
  const { restricted } = useLicense();
  const [showActivation, setShowActivation] = useState(false);
  useAutoBackup();

  return (
    <div className={`min-h-screen w-full flex ${t.bg}`}>
      <Sidebar />
      <div className="flex-1 relative">
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
        {restricted && <RestrictedOverlay onClick={() => setShowActivation(true)} />}
      </div>
      <ActivateBadge onClick={() => setShowActivation(true)} />
      {showActivation && <ActivationModal onClose={() => setShowActivation(false)} />}
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
            <HashRouter>
              {showSplash ? (
                <Splash onDone={() => setShowSplash(false)} />
              ) : (
                <Root />
              )}
            </HashRouter>
          </AuthProvider>
        </LicenseProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
