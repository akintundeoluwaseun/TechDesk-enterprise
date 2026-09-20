import { useEffect } from "react";
import { db } from "./db";
import { can } from "./tier";

// logActivity() pushes to the LAN server whenever something new happens,
// but that leaves the phone view empty until the first new event of the
// session. Push once on launch too, so it shows real history immediately.
export function useLanSync() {
  useEffect(() => {
    // Enterprise only, and a runtime check now rather than a build constant:
    // one app, and a shop that upgrades gets this without reinstalling.
    if (!can("lan")) return;
    if (!window.techdesk?.syncActivity) return; // web preview / no Electron bridge
    db.syncToLan();
  }, []);
}
