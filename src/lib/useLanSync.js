import { useEffect } from "react";
import { db } from "./db";

// logActivity() pushes to the LAN server whenever something new happens,
// but that leaves the phone view empty until the first new event of the
// session. Push once on launch too, so it shows real history immediately.
export function useLanSync() {
  useEffect(() => {
    if (!window.techdesk?.syncActivity) return; // web preview / no Electron bridge
    db.syncToLan();
  }, []);
}
