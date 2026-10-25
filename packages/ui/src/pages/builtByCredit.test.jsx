import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginScreen from "./LoginScreen";
import { ThemeProvider } from "../lib/ThemeContext";
import { AuthProvider } from "../lib/AuthContext";
import { SettingsProvider } from "../lib/SettingsContext";
import { LicenseProvider } from "../lib/LicenseContext";
import { HelpProvider } from "../lib/HelpContext";
import { BUILDER, BUILDER_LINE } from "@techdesk/editions";

// The sign-in screen is the one place every user of the app passes through,
// which is why the credit sits there. It is deliberately small and muted --
// a shop signing in at the counter should be reading the keypad -- and that
// is exactly the kind of thing that gets lost in a later redesign without
// anybody noticing, so it is pinned here.

function show() {
  localStorage.setItem(
    "techdesk_users",
    JSON.stringify([{ id: "u1", name: "Owner", role: "admin", pin: "1234" }]),
  );
  return render(
    <MemoryRouter>
      <ThemeProvider><SettingsProvider><LicenseProvider><AuthProvider><HelpProvider>
        <LoginScreen />
      </HelpProvider></AuthProvider></LicenseProvider></SettingsProvider></ThemeProvider>
    </MemoryRouter>,
  );
}

describe("the sign-in screen carries the line of credit", () => {
  beforeEach(() => localStorage.clear());

  it("shows it, linked to the portfolio", () => {
    show();
    const link = screen.getByText(BUILDER_LINE);
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", BUILDER.url);
  });

  it("opens it safely in a new tab", () => {
    show();
    const a = screen.getByText(BUILDER_LINE).closest("a");
    expect(a).toHaveAttribute("target", "_blank");
    // Without noopener the opened page gets a handle back on the app.
    expect(a.getAttribute("rel")).toContain("noopener");
  });
});
