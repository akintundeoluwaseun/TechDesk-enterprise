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

  it("starts with two buttons: Pay online and I have a code", () => {
    openAs("free");
    expect(screen.getByRole("button", { name: /Pay online/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /I have a code/i })).toBeInTheDocument();
    expect(payButton()).toBe(null);
  });

  it("Pay online shows the three options; a Business shop can only Upgrade", () => {
    openAs("business");
    fireEvent.click(screen.getByRole("button", { name: /Pay online/i }));
    expect(screen.getByRole("button", { name: /Activate Business/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Activate Enterprise/i })).toBeDisabled();
    const upgrade = screen.getByRole("button", { name: /Upgrade Business → Enterprise/i });
    expect(upgrade).toBeEnabled();
    expect(payButton()).toBe(null);
    fireEvent.click(upgrade);
    expect(payButton()).toBeInTheDocument();
  });

  it("offers nothing to buy at the top tier", () => {
    openAs("enterprise");
    expect(screen.getByRole("heading", { name: /TechDesk Enterprise is on/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Pay online/i }));
    for (const name of [/Activate Business/i, /Activate Enterprise/i, /Upgrade Business → Enterprise/i]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(payButton()).toBe(null);
  });

  it("lets a free shop pick Business or Enterprise; Upgrade is for Business shops", () => {
    openAs("free");
    fireEvent.click(screen.getByRole("button", { name: /Pay online/i }));
    expect(screen.getByRole("button", { name: /Activate Business/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Upgrade Business → Enterprise/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Activate Enterprise/i }));
    expect(payButton()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Activate Business/i })).toBe(null);
  });
});
