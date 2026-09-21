// TechDesk in a browser tab.
//
// The fourth shell, and the one that was left out of the merge: desktop,
// Android and Monitor were brought onto the shared renderer while the Web App
// stayed a separate repository with its own copy of everything. It therefore
// missed the entire tier system, and every paid feature was free there --
// staff accounts, PDF receipts, WhatsApp, head office -- not by decision but
// because that code had never reached it.
//
// There is nothing shell-specific to set up here. A browser is what
// @techdesk/platform falls back to when there is no Electron bridge and no
// Capacitor, and head office already routes to the implementation that keeps
// its token in this origin's storage. So the whole file is: bind core, render
// the same app the other three render.
import "@techdesk/ui/bindCore";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@techdesk/ui";
import ErrorBoundary from "@techdesk/ui/ErrorBoundary";
import "@techdesk/ui/index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
