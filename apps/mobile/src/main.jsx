// The Android shell's entry point.
//
// Same screens as the desktop, same records, same tier -- @techdesk/ui is the
// whole app. Two things are different about a phone, and both are settled
// here before anything renders.
//
// A WebView has no download manager, so the browser's anchor trick does
// nothing at all and a shop tapping "save" gets silence. The Capacitor
// adapter writes into the phone's own Documents folder instead. It is
// registered rather than detected, which is what keeps @capacitor/filesystem
// out of the desktop build.
//
// And there is no native side behind window.techdesk here, which core treats
// as normal: the phone keeps its records in the WebView's own storage.
import { setPlatform } from "@techdesk/platform";
import { capacitorAdapter } from "@techdesk/platform/capacitor";

setPlatform(capacitorAdapter);

// Android's back button, before anything renders: without this it falls
// through to the WebView's default, which closes the app whenever the page
// has no history behind it. See backButton.js.
import { wireBackButton } from "./backButton";
wireBackButton();

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
