// Picking the shell's adapter.
//
// Browser and Electron are chosen here because both are reachable from any
// build. Capacitor is NOT: the mobile entry point registers it with
// setPlatform(), the same way the app binds core. That is not ceremony -- it
// is what keeps @capacitor/filesystem out of a desktop build's dependency
// tree, which is why the editions used to ship a stub of nativeSave.js each.
// One source, no stubs, and the desktop bundle still never sees Capacitor.
import { currentShell } from "./shell";
import { browserAdapter } from "./browser";
import { electronAdapter } from "./electron";

export * from "./shell";
export { browserAdapter } from "./browser";
export { electronAdapter } from "./electron";
export { blobToBase64 } from "./blob";

let registered = null;

/**
 * Hand over the adapter for a shell this bundle knows about but cannot
 * import. Called by the mobile entry point with the Capacitor adapter.
 * @param {import("./types").PlatformAdapter|null} adapter
 */
export function setPlatform(adapter) {
  registered = adapter || null;
}

/** @returns {import("./types").PlatformAdapter} */
export function platform() {
  if (registered) return registered;

  const shell = currentShell();
  if (shell === "electron") return electronAdapter;

  if (shell === "capacitor") {
    // Falling back to the browser adapter here would be the original bug
    // rebuilt: on Android its anchor click does nothing at all, so the shop
    // taps save and gets silence. Better to be loud than to be quiet and
    // wrong.
    throw new Error(
      "Running under Capacitor with no platform adapter registered. " +
        "The mobile entry point must call setPlatform(capacitorAdapter)."
    );
  }

  return browserAdapter;
}
