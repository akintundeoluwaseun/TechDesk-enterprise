import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ActivationModal from "./ActivationModal";
import { ThemeProvider } from "../lib/ThemeContext";
import { SettingsProvider } from "../lib/SettingsContext";
import { LicenseProvider } from "../lib/LicenseContext";
import { setCurrentTier } from "../lib/tier";

// The in-app checkout is what these test, so it is switched on here (the app ships codes-only).
vi.mock("../lib/store", () => ({ PLAY_STORE: false, CODES_ONLY: false, STORE: "" }));

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

  it("offers the one tier above as a single card, which opens that tier's own pay button", () => {
    openAs("business");
    expect(screen.getByRole("button", { name: /Upgrade to TechDesk Enterprise/i })).toBeInTheDocument();
    expect(payButton()).toBe(null);

    fireEvent.click(screen.getByRole("button", { name: /Upgrade to TechDesk Enterprise/i }));
    expect(payButton()).toBeInTheDocument();
  });

  it("offers nothing to buy, and no way to pay, at the top tier", () => {
    const { container } = openAs("enterprise");
    expect(screen.getByRole("heading", { name: /TechDesk Enterprise is on/i })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Upgrade to/i);
    expect(payButton()).toBe(null);
  });

  it("lets a free shop pick Business or Enterprise, not just the next tier up", () => {
    openAs("free");
    const businessCard = screen.getByRole("button", { name: /Upgrade to TechDesk Business/i });
    const enterpriseCard = screen.getByRole("button", { name: /Upgrade to TechDesk Enterprise/i });
    expect(businessCard).toBeInTheDocument();
    expect(enterpriseCard).toBeInTheDocument();
    // The choice is plain -- nothing about either plan shown until one is picked.
    expect(payButton()).toBe(null);

    fireEvent.click(enterpriseCard);
    expect(payButton()).toBeInTheDocument();
    // Picking Enterprise never shows Business's own card behind it.
    expect(screen.queryByRole("button", { name: /Upgrade to TechDesk Business/i })).toBe(null);
  });
});
