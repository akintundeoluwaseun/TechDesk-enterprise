import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "../lib/ThemeContext";
import MoreSheet, { moreItems } from "./MoreSheet";

const admin = { role: "admin" };
const show = (props = {}) =>
  render(<ThemeProvider><MoreSheet onClose={vi.fn()} items={[]} {...props} /></ThemeProvider>);

// The extras used to expand inside the menu, which made the menu taller than
// a small phone could show -- and in landscape, much taller -- so whatever
// you were reaching for ended up below the fold.
describe("the More sheet", () => {
  it("offers the four extras to an owner", () => {
    const items = moreItems({ user: admin, openRestock: vi.fn(), openChaser: vi.fn(), openBrief: vi.fn(), openWhatsNew: vi.fn() });
    expect(items.map((i) => i.label)).toEqual(["Restock planner", "Money owed", "Morning brief", "What's new"]);
  });

  it("leaves out what a worker has no access to", () => {
    const repairer = { role: "worker", pages: ["repairs"] };
    const items = moreItems({ user: repairer, openRestock: vi.fn(), openChaser: vi.fn(), openBrief: vi.fn(), openWhatsNew: vi.fn() });
    expect(items.map((i) => i.label)).toEqual(["Morning brief", "What's new"]);
  });

  it("closes itself before doing the thing, so the sheet isn't left over the top", () => {
    const onClose = vi.fn();
    const openBrief = vi.fn();
    const items = moreItems({ user: admin, openRestock: vi.fn(), openChaser: vi.fn(), openBrief, openWhatsNew: vi.fn() });
    show({ onClose, items });
    fireEvent.click(screen.getByText("Morning brief"));
    expect(onClose).toHaveBeenCalled();
    expect(openBrief).toHaveBeenCalled();
  });

  it("closes on the X and on the backdrop", () => {
    const onClose = vi.fn();
    const { container } = show({ onClose, items: [] });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(container.querySelector(".td-overlay"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("takes whatever extra a surface adds, like the phone's theme switch", () => {
    const items = moreItems({
      user: admin, openRestock: vi.fn(), openChaser: vi.fn(), openBrief: vi.fn(), openWhatsNew: vi.fn(),
      extra: [{ label: "Light mode", icon: () => null, onClick: vi.fn(), tone: "" }],
    });
    expect(items.map((i) => i.label)).toContain("Light mode");
  });
});
