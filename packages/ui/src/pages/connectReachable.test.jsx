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

// And the screen behind that door has to make sense to whoever opened it.
//
// One screen, two reasons to be on it: an Enterprise shop is connecting a
// BRANCH to a head office that watches several shops; a Business shop has no
// head office at all and is putting a second bench in the same shop. The
// words were written only for the first, so the tier that needs this most was
// reading about something it does not have.
describe("what the connect screen says", () => {
  beforeEach(() => localStorage.clear());

  // Set the way the APP sets it. setCurrentTier alone is overwritten the
  // moment LicenseProvider mounts and re-reads storage -- which is how the
  // Business case here first passed while proving nothing: the screen was
  // showing the shop wording because the tier was free, not because it was
  // Business.
  function asTier(tier) {
    localStorage.setItem("techdesk_tier", tier);
    setCurrentTier(tier);
  }

  async function connectScreen() {
    const { default: ConnectHqTab } = await import("./settings/ConnectHqTab");
    const { SettingsProvider } = await import("../lib/SettingsContext");
    const { LicenseProvider } = await import("../lib/LicenseContext");
    return render(
      <MemoryRouter>
        <ThemeProvider><SettingsProvider><LicenseProvider>
          <ConnectHqTab />
        </LicenseProvider></SettingsProvider></ThemeProvider>
      </MemoryRouter>,
    );
  }

  it("talks about the shop when there is no head office", async () => {
    asTier("business");
    const { container } = await connectScreen();
    expect(container.textContent).toContain("Connect this device to your shop");
    expect(container.textContent).toContain("share stock, repairs and customers");
    // A Business shop has no HQ to ring.
    expect(container.textContent).not.toContain("Ring them");
  });

  it("talks about head office when there is one", async () => {
    asTier("enterprise");
    const { container } = await connectScreen();
    expect(container.textContent).toContain("Connect this branch to HQ");
    expect(container.textContent).toContain("head office");
  });
});
