// The desktop app.
//
// An Electron renderer is a browser, so delivery is the browser's: a download
// lands in the machine's downloads folder and a viewer opens in a new window.
// This adapter exists as its own name rather than an alias because the two
// will diverge -- a native save dialog belongs here and nowhere else -- and
// because "which shell am I" should have one answer per shell, not two shells
// sharing one.
import { browserAdapter } from "./browser";

/** @type {import("./types").PlatformAdapter} */
export const electronAdapter = {
  ...browserAdapter,
  name: "electron",
};
