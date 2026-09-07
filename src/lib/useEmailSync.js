import { useEffect } from "react";
import { db } from "./db";

// SMTP/digest settings are only pushed to the main process when Settings is
// saved, which leaves the daily digest disabled until the shop owner
// happens to touch that page after each app restart. Push once on launch
// too, so a previously-configured digest keeps firing without that step.
export function useEmailSync() {
  useEffect(() => {
    if (!window.techdesk?.syncEmailSettings) return; // web preview / no Electron bridge
    db.syncEmailSettings();
  }, []);
}
