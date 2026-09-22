import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import UpgradeLock, { upgradeLine } from "../components/UpgradeLock";
import { ThemeProvider } from "../lib/ThemeContext";
import { setCurrentTier } from "../lib/tier";
import { ALL_TABS } from "./SettingsPage";

// A Business shop must be able to reach the door into its own shop.
//
// Sharing is what Business is sold on, and the only way to join a shop is to
// connect the device -- which sat behind the "hq" capability. The moment head
// office moved to Enterprise, that locked a Business shop out of the feature
// it had just paid for: it could tick what to share on one tab and have no
// way to share it with anybody.
//
// Nothing caught it, because every test asked whether a tier HAS a
// capability and none asked whether the screen that uses it is reachable.

function lock(feature) {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <UpgradeLock feature={feature} title="Connect this device" what="Link this device to your shop.">
          <div>the connect screen</div>
        </UpgradeLock>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

// Read from the real tab list, not written out again here: the bug was in
// what the Settings page asks for, so a test that hardcodes the right answer
// would have gone on passing through the whole outage.
const CONNECT = ALL_TABS.find((t) => t.key === "hq").feature;

describe("connecting a device to its shop", () => {
  beforeEach(() => localStorage.clear());

  it("is open to Business, which needs it for sharing", () => {
    setCurrentTier("business");
    lock(CONNECT);
    expect(screen.getByText("the connect screen")).toBeInTheDocument();
  });

  it("is open to Enterprise, which needs it for head office", () => {
    setCurrentTier("enterprise");
    lock(CONNECT);
    expect(screen.getByText("the connect screen")).toBeInTheDocument();
  });

  it("is still shut to the free tier", () => {
    setCurrentTier("free");
    lock(CONNECT);
    expect(screen.queryByText("the connect screen")).toBe(null);
  });

  it("names the cheaper of the two tiers when it is shut", () => {
    // Offering Enterprise to somebody who only needs Business is asking them
    // for 2,000 naira they do not have to spend.
    expect(upgradeLine(CONNECT)).toContain("Business");
    expect(upgradeLine(CONNECT)).not.toContain("Enterprise");
  });

  it("still works for a panel that needs exactly one capability", () => {
    setCurrentTier("business");
    lock("hq");
    expect(screen.queryByText("the connect screen")).toBe(null);
    lock("shareData");
    expect(screen.getByText("the connect screen")).toBeInTheDocument();
  });
});
