import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "./ThemeContext";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LockedButton } from "../components/UpgradeLock";
import { setCurrentTier, FREE_TIER } from "./tier";
import { onOpenUpgrade } from "./upgradeModal";

// The way to pay must exist on the shell most shops will use.
//
// Two bugs shipped together in 4.0.0 and both had the same shape: a control
// that is present in the source, renders nothing or does nothing, and throws
// no error while doing it. Nothing failed. The app simply had no route to
// the upgrade screen on a phone, which is the one screen that takes money.

// Rendered the way the app renders it. The button reads theme tokens, so a
// bare render throws -- and a test that stubs the theme away is testing a
// component the shop never sees.
const show = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe("a locked control", () => {
  beforeEach(() => setCurrentTier(FREE_TIER));

  it("opens the upgrade screen when it is tapped", () => {
    // The real listener, not a spy on the import: the shell subscribes
    // through exactly this, so this is the thing that has to fire.
    let opened = 0;
    const stop = onOpenUpgrade(() => { opened += 1; });
    show(<LockedButton feature="receiptPdf" title="Save PDF">Save PDF</LockedButton>);
    screen.getByRole("button").click();
    stop();
    expect(opened).toBe(1);
  });

  it("says which tier opens it, for the shops that can hover", () => {
    show(<LockedButton feature="hq" title="Head office">Head office</LockedButton>);
    expect(screen.getByRole("button").getAttribute("title")).toMatch(/Upgrade to/);
  });

  it("is shown rather than hidden -- a missing button is not an offer", () => {
    show(<LockedButton feature="receiptShare" title="Send">Send</LockedButton>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});

describe("the phone's menu", () => {
  const src = readFileSync(join(process.cwd(), "src/components/MobileAppBar.jsx"), "utf8");

  it("has no constant standing in for a licence check", () => {
    // `const activated = true;` sat above `{!activated && <upgrade button>}`,
    // so the button was unreachable from the moment it was written.
    expect(src).not.toMatch(/const\s+activated\s*=\s*(true|false)\s*;/);
  });

  it("still offers a way into the upgrade screen", () => {
    expect(src).toMatch(/onOpenActivation\?\.\(\)/);
  });

  it("leaves room for the status bar", () => {
    // Android 15 draws edge to edge; without this the shop name renders
    // behind the clock.
    expect(src).toMatch(/env\(safe-area-inset-top\)/);
  });
});
