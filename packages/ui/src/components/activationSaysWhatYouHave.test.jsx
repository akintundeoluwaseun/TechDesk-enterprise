import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ActivationModal from "./ActivationModal";
import { ThemeProvider } from "../lib/ThemeContext";
import { SettingsProvider } from "../lib/SettingsContext";
import { LicenseProvider } from "../lib/LicenseContext";
import { setCurrentTier } from "../lib/tier";

// A shop that has paid opened this and thought it still had to activate.
//
// The screen had kept the shape of the old trial activation screen: the PIN
// in the biggest type on the page under "read this out when you pay", and a
// black Unlock button under an empty code box. The line saying they were
// already on Enterprise was small and grey, above all of it.
//
// So these pin the order of the argument, not the wording: what you HAVE is
// the loudest thing, and the code box only leads the screen for somebody who
// has not bought yet.

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

const codeBox = () => screen.queryByLabelText("Activation code");

describe("the licence screen leads with what you already have", () => {
  beforeEach(() => localStorage.clear());

  it("tells a paid shop its plan is on, in the heading", () => {
    openAs("business");
    expect(screen.getByRole("heading", { name: /TechDesk Business is on/i })).toBeInTheDocument();
  });

  it("does not put a PIN and a code box in front of a shop that has paid", () => {
    const { container } = openAs("business");
    expect(codeBox()).toBe(null);
    expect(container.textContent).not.toContain("read this out when you pay");
  });

  it("still offers the tier above, and the code box when asked for it", () => {
    openAs("business");
    expect(screen.getByText(/Upgrade to TechDesk Enterprise/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /I have an upgrade code/i }));
    expect(codeBox()).toBeInTheDocument();
  });

  it("offers nothing to buy at the top tier", () => {
    const { container } = openAs("enterprise");
    expect(screen.getByRole("heading", { name: /TechDesk Enterprise is on/i })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Upgrade to/i);
    // But a shop that moved to a new computer still needs somewhere to type
    // the code it already paid for.
    fireEvent.click(screen.getByRole("button", { name: /Moved to a new computer/i }));
    expect(codeBox()).toBeInTheDocument();
  });

  it("still leads with the PIN and the code box for a shop that has not paid", () => {
    // The screen's original job, and it must not be buried by the fix.
    const { container } = openAs("free");
    expect(codeBox()).toBeInTheDocument();
    expect(container.textContent).toContain("read this out when you pay");
    expect(screen.getByText(/Upgrade to TechDesk Business/i)).toBeInTheDocument();
  });
});
