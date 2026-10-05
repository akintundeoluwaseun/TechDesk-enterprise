import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../lib/ThemeContext";
import { AuthProvider } from "../lib/AuthContext";
import OnboardingScreen from "./OnboardingScreen";

// First run: four animated steps before the choice AccountGateScreen already asks,
// not straight onto that choice, and not straight onto the dashboard.

function show(onDone = () => {}) {
  return render(
    <ThemeProvider><AuthProvider>
      <OnboardingScreen onDone={onDone} />
    </AuthProvider></ThemeProvider>,
  );
}

function toGate() {
  fireEvent.click(screen.getByText("Get Started"));
  fireEvent.click(screen.getByText("Next"));
  fireEvent.click(screen.getByText("Next"));
  fireEvent.click(screen.getByText("Next"));
}

describe("first run walks through its steps, not straight to the dashboard", () => {
  beforeEach(() => localStorage.clear());

  it("opens on Welcome", () => {
    show();
    expect(screen.getByRole("heading", { name: /welcome to techdesk/i })).toBeInTheDocument();
    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });

  it("Get Started moves to the feature showcase, with a tab for each part of the app", () => {
    show();
    fireEvent.click(screen.getByText("Get Started"));
    expect(screen.getByText("Everything your shop needs")).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Sales", "Repairs", "Inventory", "Reports"]);
    // Sales plays first.
    expect(screen.getByText("Ring up a sale in seconds")).toBeInTheDocument();
  });

  it("tapping a tab switches the showcase to it", () => {
    show();
    fireEvent.click(screen.getByText("Get Started"));
    fireEvent.click(screen.getByRole("tab", { name: /repairs/i }));
    expect(screen.getByText("Track every job to the end")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /repairs/i })).toHaveAttribute("aria-selected", "true");
  });

  it("Next walks through money and growth, then the AI assistant", () => {
    show();
    fireEvent.click(screen.getByText("Get Started"));
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Never lose money. Grow with control.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Meet your AI assistant")).toBeInTheDocument();
    for (const s of ["Talk", "Ask", "Snap"]) expect(screen.getByText(s)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Never lose money. Grow with control.")).toBeInTheDocument();
  });

  it("then reaches the new-business / join-existing question", () => {
    show();
    toGate();
    // AccountGateScreen's own screen -- unmodified, just reached a different way.
    expect(screen.getByText("Set up your business")).toBeInTheDocument();
    expect(screen.getByText("Sign in to your business")).toBeInTheDocument();
    expect(screen.getByText("Continue locally, no account")).toBeInTheDocument();
  });

  it("Back on the showcase returns to Welcome", () => {
    show();
    fireEvent.click(screen.getByText("Get Started"));
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByRole("heading", { name: /welcome to techdesk/i })).toBeInTheDocument();
  });

  it("Back on the last step returns to the step before it, not out of onboarding", () => {
    show();
    toGate();
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Meet your AI assistant")).toBeInTheDocument();
  });

  it("finishing on the last step (continuing locally) still calls onDone", () => {
    let done = false;
    show(() => {
      done = true;
    });
    toGate();
    fireEvent.click(screen.getByText("Continue locally, no account"));
    expect(done).toBe(true);
  });

  it("is a first-startup-only screen: finishing it records the answer, so it never shows again", async () => {
    const { getAccountGateDecision } = await import("../lib/account");
    expect(getAccountGateDecision()).toBeFalsy();
    show();
    toGate();
    fireEvent.click(screen.getByText("Continue locally, no account"));
    // App.jsx only shows onboarding while this is empty (and the device has
    // no records of its own), so once it's set the app opens straight in.
    expect(getAccountGateDecision()).toBe("local");
  });

  it("shows all five steps as dots throughout", () => {
    const { container } = show();
    expect(container.querySelectorAll(".fixed.top-6 span").length).toBe(5);
  });

  it("is dark regardless of the shop's own saved theme -- there's no shop settings yet", () => {
    localStorage.setItem("techdesk_theme", "light");
    const { container } = show();
    expect(container.querySelector(".bg-neutral-900")).not.toBe(null);
    expect(container.querySelector(".bg-neutral-200")).toBe(null);
  });
});
