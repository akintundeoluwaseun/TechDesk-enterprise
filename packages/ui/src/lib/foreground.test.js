import { describe, it, expect, vi } from "vitest";
import { onAppForeground } from "./foreground";

// The Android app never fired "focus" on resume and its timers were suspended
// while it sat in the background, so an installed phone stopped asking us for
// announcements, the console's switches and new versions after its first run.
describe("coming back to the front", () => {
  it("runs on a window focus and on the WebView becoming visible again", () => {
    const run = vi.fn();
    const off = onAppForeground(run);

    window.dispatchEvent(new Event("focus"));
    expect(run).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event("visibilitychange"));
    expect(run).toHaveBeenCalledTimes(2);

    off();
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("does not run when the app is going away", () => {
    const run = vi.fn();
    const off = onAppForeground(run);
    const was = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(run).not.toHaveBeenCalled();
    if (was) Object.defineProperty(document, "visibilityState", was);
    off();
  });
});
