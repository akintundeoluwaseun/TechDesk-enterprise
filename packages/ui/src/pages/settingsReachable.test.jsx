import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UpgradeLock, { upgradeLine } from "../components/UpgradeLock";
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
//
// The fix was not a wider gate on Connect. Syncing and head office are
// different things and ask for different capabilities, which these tests
// pin: each section asks for the capability its own feature is sold under,
// and neither borrows the other's. Sync and Connect used to be separate
// top-level tabs for exactly this reason; they are both sections inside
// Account now (folded in at the person running this shop's request, who
// reads them as the same kind of screen), but the gate each one asks for
// did not move with them.

// Read from AccountTab's own source, not written out again here: the bug
// was in what the screen asks for, so a test that hardcodes the right
// answer would have gone on passing through the whole outage. This used to
// read ALL_TABS; the gate declarations live inline in AccountTab.jsx now
// that Sync and Connect are sections of it rather than tabs of their own.
const accountTabSrc = readFileSync(resolve(__dirname, "./settings/AccountTab.jsx"), "utf-8");

function featureFor(marker) {
  const i = accountTabSrc.indexOf(marker);
  if (i === -1) throw new Error(`AccountTab.jsx no longer has a section for "${marker}"`);
  const after = accountTabSrc.slice(i);
  const m = after.match(/feature="([^"]+)"/);
  if (!m) throw new Error(`No UpgradeLock feature found after "${marker}"`);
  return m[1];
}

const SYNC = featureFor("Sync with another device");
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

describe("syncing with another device", () => {
  beforeEach(() => localStorage.clear());

  it("is open to Business, which is the tier it is sold under", () => {
    setCurrentTier("business");
    lock(SYNC);
    expect(screen.getByText("the screen")).toBeInTheDocument();
  });

  it("is open to Enterprise, which has everything Business has", () => {
    setCurrentTier("enterprise");
    lock(SYNC);
    expect(screen.getByText("the screen")).toBeInTheDocument();
  });

  it("is shut to the free tier, and says Business rather than Enterprise", () => {
    setCurrentTier("free");
    lock(SYNC);
    expect(screen.queryByText("the screen")).toBe(null);
    // Offering Enterprise to somebody who only needs Business is asking them
    // for 2,000 naira they do not have to spend.
    expect(upgradeLine(SYNC)).toContain("Business");
    expect(upgradeLine(SYNC)).not.toContain("Enterprise");
  });

  it("does not need head office", () => {
    // The whole point of the rebuild. A device syncs with the bench next to
    // it without any head office existing, so the sync section must never
    // ask for the capability head office is sold under.
    expect([].concat(SYNC)).not.toContain("hq");
  });
});

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
