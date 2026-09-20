// The desktop shell's entry point.
//
// Everything a person looks at is @techdesk/ui -- the same screens the phone
// and the browser show. What is different here is Electron: a native side
// behind window.techdesk, and a downloads folder to save into. Both are told
// to core and the platform layer before the first component renders.
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
