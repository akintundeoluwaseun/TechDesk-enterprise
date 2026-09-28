import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UpgradeLock from "../components/UpgradeLock";
import { ThemeProvider } from "../lib/ThemeContext";
import { setCurrentTier } from "../lib/tier";

// A tier must be able to reach the screen for the thing it bought.
//
// This file exists because of a specific outage. Syncing was what Business
// was sold on, and the only way to set it up was the Connect tab -- which sat
// behind the "hq" capability. The moment head office moved to Enterprise,
// that locked a Business shop out of the feature it had just paid for: it
// could tick what to send on one tab and have no way to send it to anybody.
//
// Nothing caught it, because every test asked whether a tier HAS a
// capability and none asked whether the screen that uses it is reachable.
// The device-to-device sync feature that outage was about no longer exists
// -- it was fully removed -- so what is left here is the head office half:
// Connect must keep asking for the capability head office is actually sold
// under, not one borrowed from a feature that used to sit beside it.

// Read from AccountTab's own source, not written out again here: the bug
// was in what the screen asks for, so a test that hardcodes the right
// answer would have gone on passing through the whole outage.
const accountTabSrc = readFileSync(resolve(__dirname, "./settings/AccountTab.jsx"), "utf-8");

function featureFor(marker) {
  const i = accountTabSrc.indexOf(marker);
  if (i === -1) throw new Error(`AccountTab.jsx no longer has a section for "${marker}"`);
  const after = accountTabSrc.slice(i);
  const m = after.match(/feature="([^"]+)"/);
  if (!m) throw new Error(`No UpgradeLock feature found after "${marker}"`);
  return m[1];
}

const CONNECT = featureFor("Connect to head office");

function lock(feature) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <UpgradeLock feature={feature} title="A settings screen" what="Set something up.">
          <div>the screen</div>
        </UpgradeLock>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("connecting a branch to head office", () => {
  beforeEach(() => localStorage.clear());

  it("is Enterprise, and shut to Business", () => {
    setCurrentTier("business");
    lock(CONNECT);
    expect(screen.queryByText("the screen")).toBe(null);

    setCurrentTier("enterprise");
    lock(CONNECT);
    expect(screen.getByText("the screen")).toBeInTheDocument();
  });

  it("talks about head office, because that is all it is for", async () => {
    localStorage.setItem("techdesk_tier", "enterprise");
    setCurrentTier("enterprise");
    const { default: ConnectHqTab } = await import("./settings/ConnectHqTab");
    const { SettingsProvider } = await import("../lib/SettingsContext");
    const { LicenseProvider } = await import("../lib/LicenseContext");
    const { container } = render(
      <MemoryRouter>
        <ThemeProvider><SettingsProvider><LicenseProvider>
          <ConnectHqTab />
        </LicenseProvider></SettingsProvider></ThemeProvider>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Connect this branch to HQ");
    expect(container.textContent).toContain("head office");
  });
});
