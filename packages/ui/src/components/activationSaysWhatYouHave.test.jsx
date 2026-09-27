import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ActivationModal from "./ActivationModal";
import { ThemeProvider } from "../lib/ThemeContext";
import { SettingsProvider } from "../lib/SettingsContext";
import { LicenseProvider } from "../lib/LicenseContext";
import { setCurrentTier } from "../lib/tier";

// A shop that has paid opened this and thought it still had to activate.
//
// The screen used to lead with a PIN and an empty code box even for a shop
// that had already bought everything, with the line saying so small and grey
// above it. The PIN and the code box are gone now -- there is no manual code
// path left at all, only "Pay with card, bank transfer or USSD" -- but the
// same order of argument still matters: what you HAVE is the loudest thing
// on the screen, and the upgrade pitch only leads for a shop that hasn't
// bought the tier above yet.

function openAs(tier) {
  localStorage.clear();
  localStorage.setItem("techdesk_tier", tier);
  if (tier !== "free") {
    localStorage.setItem("techdesk_activated", "1");
    localStorage.setItem(
      "techdesk_unlocks",
      JSON.stringify([{ tier, at: "2026-09-01T10:00:00.000Z" }]),
    );
  }
  // setCurrentTier alone is overwritten the moment LicenseProvider mounts and
  // re-reads storage, so the storage above is what actually decides this.
  setCurrentTier(tier);
  return render(
    <ThemeProvider>
      <SettingsProvider>
        <LicenseProvider>
          <ActivationModal onClose={() => {}} />
        </LicenseProvider>
      </SettingsProvider>
    </ThemeProvider>,
  );
}

const payButton = () => screen.queryByRole("button", { name: /Pay with card/i });

describe("the licence screen leads with what you already have", () => {
  beforeEach(() => localStorage.clear());

  it("tells a paid shop its plan is on, in the heading", () => {
    openAs("business");
    expect(screen.getByRole("heading", { name: /TechDesk Business is on/i })).toBeInTheDocument();
  });

  it("never shows a PIN or a code box -- paying happens on this screen, not by typing one in", () => {
    const { container } = openAs("business");
    expect(screen.queryByLabelText(/Activation code/i)).toBe(null);
    expect(container.textContent).not.toContain("read this out when you pay");
  });

  it("still offers the tier above, with the pay button in front, not behind a toggle", () => {
    openAs("business");
    expect(screen.getByText(/Upgrade to TechDesk Enterprise/i)).toBeInTheDocument();
    expect(payButton()).toBeInTheDocument();
  });

  it("offers nothing to buy, and no way to pay, at the top tier", () => {
    const { container } = openAs("enterprise");
    expect(screen.getByRole("heading", { name: /TechDesk Enterprise is on/i })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Upgrade to/i);
    expect(payButton()).toBe(null);
  });

  it("leads with the upgrade pitch and the pay button for a shop that has not paid", () => {
    openAs("free");
    expect(screen.getByText(/Upgrade to TechDesk Business/i)).toBeInTheDocument();
    expect(payButton()).toBeInTheDocument();
  });
});
