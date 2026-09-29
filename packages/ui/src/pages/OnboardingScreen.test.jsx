import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../lib/ThemeContext";
import { AuthProvider } from "../lib/AuthContext";
import OnboardingScreen from "./OnboardingScreen";

// First run: three steps before the choice AccountGateScreen already asks,
// not straight onto that choice, and not straight onto the dashboard.

function show(onDone = () => {}) {
  return render(
    <ThemeProvider><AuthProvider>
      <OnboardingScreen onDone={onDone} />
    </AuthProvider></ThemeProvider>,
  );
}

describe("first run walks through three steps, not straight to the dashboard", () => {
  beforeEach(() => localStorage.clear());

  it("opens on Welcome", () => {
    show();
    expect(screen.getByText("Welcome to TechDesk")).toBeInTheDocument();
    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });

  it("Get Started moves to the quick-info step", () => {
    show();
    fireEvent.click(screen.getByText("Get Started"));
    expect(screen.getByText("Everything your shop needs")).toBeInTheDocument();
    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(screen.getByText("Repairs")).toBeInTheDocument();
    expect(screen.getByText("Inventory")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();
  });

  it("Next on quick-info reaches the new-business / join-existing question", () => {
    show();
    fireEvent.click(screen.getByText("Get Started"));
    fireEvent.click(screen.getByText("Next"));
    // AccountGateScreen's own screen -- unmodified, just reached a different way.
    expect(screen.getByText("Set up your business")).toBeInTheDocument();
    expect(screen.getByText("Connect to a business -- sign in")).toBeInTheDocument();
    expect(screen.getByText("Continue locally, no account")).toBeInTheDocument();
  });

  it("Back on quick-info returns to Welcome", () => {
    show();
    fireEvent.click(screen.getByText("Get Started"));
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Welcome to TechDesk")).toBeInTheDocument();
  });

  it("Back on the last step returns to quick-info, not out of onboarding", () => {
    show();
    fireEvent.click(screen.getByText("Get Started"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Everything your shop needs")).toBeInTheDocument();
  });

  it("finishing on the last step (continuing locally) still calls onDone", () => {
    let done = false;
    show(() => {
      done = true;
    });
    fireEvent.click(screen.getByText("Get Started"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Continue locally, no account"));
    expect(done).toBe(true);
  });

  it("shows all three steps as dots throughout", () => {
    const { container } = show();
    expect(container.querySelectorAll(".fixed.top-6 span").length).toBe(3);
  });

  it("is dark regardless of the shop's own saved theme -- there's no shop settings yet", () => {
    localStorage.setItem("techdesk_theme", "light");
    const { container } = show();
    // bg-neutral-900 is the dark token for the page background; the light
    // token is bg-neutral-200. This is the one place that never reads the
    // saved preference.
    expect(container.querySelector(".bg-neutral-900")).not.toBe(null);
    expect(container.querySelector(".bg-neutral-200")).toBe(null);
  });
});
