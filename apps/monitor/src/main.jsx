import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyTheme } from "./theme";

// Before the first paint, so there is no flash of the wrong theme.
applyTheme();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Registering this is what makes the browser offer "Install", which is the
// whole difference between a link somebody loses and an app on their home
// screen. Absent inside the Android build, where Capacitor serves the files
// and there is nothing to install.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // An old browser, or a private window. The app still works; it just
      // cannot be installed, and saying so in the console helps nobody.
    });
  });
}
