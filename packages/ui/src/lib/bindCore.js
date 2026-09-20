// Telling core which machine it is on. Imported once, at the app's entry
// point, before anything reads a record.
//
// core has no idea where records live, what "the shop changed" should do, or
// whether there is a native side to call. It is handed all three here. Import
// this module for the side effect; it exports nothing worth having.
//
// This is deliberately NOT done inside db.js. It was, briefly, and the result
// was that anything importing core without going through db -- the receipt
// builders, for one -- quietly got the in-memory store and read a shop with no
// settings in it. Nothing threw. The receipts just came out without the logo.
// bindCoreIsWired.test.js exists so that cannot come back silently.
import { setStorage, setChangeSink, setHostBridge, CHANGED_EVENT } from "@techdesk/core";

if (typeof localStorage !== "undefined") setStorage(localStorage);

setChangeSink((key) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { key } }));
});

// Electron's preload bridge. Absent in the browser preview and under the test
// runner, which core treats as normal rather than broken.
if (typeof window !== "undefined" && window.techdesk) setHostBridge(window.techdesk);
