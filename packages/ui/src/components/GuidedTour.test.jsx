import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../lib/ThemeContext";
import { SettingsProvider } from "../lib/SettingsContext";
import GuidedTour, { defaultTourSteps } from "./GuidedTour";
import { isTourPending, markTourDone, markTourPending } from "../lib/tour";

// jsdom does no layout, so every element measures 0x0 and would count as
// hidden. Give anything tagged for the tour a real box.
let originalRect;
beforeEach(() => {
  localStorage.clear();
  originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    if (this.hasAttribute && this.hasAttribute("data-tour")) {
      return { top: 100, left: 100, width: 120, height: 40, right: 220, bottom: 140, x: 100, y: 100 };
    }
    return originalRect.call(this);
  };
});
afterEach(() => {
  Element.prototype.getBoundingClientRect = originalRect;
});

const STEPS = [
  { target: "a", title: "Tap A", body: "Try it.", action: "click" },
  { target: "b", title: "This is B", body: "Just look.", action: "next" },
];

function show({ steps = STEPS, onFinish = vi.fn(), onA = vi.fn(), onOther = vi.fn(), findTimeout } = {}) {
  render(
    <MemoryRouter>
      <ThemeProvider><SettingsProvider>
        <button data-tour="a" onClick={onA}>A</button>
        <button data-tour="b">B</button>
        <button onClick={onOther}>Other</button>
        <GuidedTour steps={steps} onFinish={onFinish} findTimeout={findTimeout} />
      </SettingsProvider></ThemeProvider>
    </MemoryRouter>,
  );
  return { onFinish, onA, onOther };
}

describe("the guided tour", () => {
  it("spotlights the first step and says what to do", async () => {
    show();
    expect(await screen.findByRole("dialog", { name: "Tap A" })).toBeInTheDocument();
    expect(screen.getByText(/the highlighted spot/)).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
  });

  it("a click step lets the real button work, then moves on", async () => {
    const { onA } = show();
    await screen.findByRole("dialog", { name: "Tap A" });
    fireEvent.click(screen.getByText("A"));
    expect(onA).toHaveBeenCalled();
    expect(await screen.findByRole("dialog", { name: "This is B" })).toBeInTheDocument();
  });

  it("clicking anything else does not move the tour on", async () => {
    show();
    await screen.findByRole("dialog", { name: "Tap A" });
    fireEvent.click(screen.getByText("Other"));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole("dialog", { name: "Tap A" })).toBeInTheDocument();
  });

  it("covers the page outside the target, and the target too on a look-only step", async () => {
    show();
    await screen.findByRole("dialog", { name: "Tap A" });
    // Four around the hole; the hole itself is left open to click.
    expect(screen.getAllByTestId("tour-shield")).toHaveLength(4);
    fireEvent.click(screen.getByText("A"));
    await screen.findByRole("dialog", { name: "This is B" });
    expect(screen.getAllByTestId("tour-shield")).toHaveLength(5);
  });

  it("ends on a finish card after the last step", async () => {
    const { onFinish } = show();
    await screen.findByRole("dialog", { name: "Tap A" });
    fireEvent.click(screen.getByText("A"));
    await screen.findByRole("dialog", { name: "This is B" });
    fireEvent.click(screen.getByText("Next"));
    expect(await screen.findByText("You’re all set")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Start using TechDesk"));
    expect(onFinish).toHaveBeenCalled();
  });

  it("can be skipped from any step", async () => {
    const { onFinish } = show();
    await screen.findByRole("dialog", { name: "Tap A" });
    fireEvent.click(screen.getByText("Skip tour"));
    expect(onFinish).toHaveBeenCalled();
  });

  it("skips a step whose target isn't on this screen (a page this user can't open)", async () => {
    show({ steps: [{ target: "missing", title: "Gone", body: "", action: "next" }, ...STEPS], findTimeout: 40 });
    expect(await screen.findByRole("dialog", { name: "Tap A" })).toBeInTheDocument();
  });

  it("goes back to a step's fallback when its target disappears -- the drawer shut before Sales was tapped", async () => {
    show({
      steps: [
        { target: "a", title: "Open menu", body: "", action: "next" },
        { target: "drawer-item", title: "Tap Sales", body: "", action: "click", fallback: 0 },
      ],
      findTimeout: 40,
    });
    await screen.findByRole("dialog", { name: "Open menu" });
    fireEvent.click(screen.getByText("Next"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Open menu" })).toBeInTheDocument());
  });
});

describe("which steps a first-time user is walked through", () => {
  it("on a phone, starts at the menu button, then Sales inside it", () => {
    const steps = defaultTourSteps({ desktop: false });
    expect(steps[0]).toMatchObject({ target: "menu-button", action: "click" });
    expect(steps[1]).toMatchObject({ target: "drawer-sales", action: "click", fallback: 0 });
    expect(steps.map((s) => s.target)).toContain("new-sale");
    expect(steps.map((s) => s.target)).toContain("new-repair");
  });

  it("on a desktop, walks the sidebar", () => {
    const steps = defaultTourSteps({ desktop: true });
    expect(steps[0].target).toBe("sidebar-nav");
    expect(steps.filter((s) => s.action === "click").map((s) => s.target)).toEqual(["nav-sales", "nav-repairs", "nav-inventory"]);
  });

  it("uses the shop's own word for repairs", () => {
    const steps = defaultTourSteps({ desktop: true, repairsLabel: "Jobs" });
    expect(steps.find((s) => s.target === "nav-repairs").title).toBe("Jobs");
  });
});

describe("the tour runs once, and only for a fresh install", () => {
  it("is pending only after onboarding marks it", () => {
    expect(isTourPending()).toBe(false);
    markTourPending();
    expect(isTourPending()).toBe(true);
  });

  it("once done, onboarding again can't make it pending", () => {
    markTourDone();
    markTourPending();
    expect(isTourPending()).toBe(false);
  });
});
