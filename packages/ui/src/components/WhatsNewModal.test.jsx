import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../lib/ThemeContext";
import WhatsNewModal, { ICONS } from "./WhatsNewModal";
import { UPDATES, hasUnseenUpdate, markUpdatesSeen, latestUpdateId, openWhatsNew, onOpenWhatsNew } from "../lib/whatsNew";

beforeEach(() => localStorage.clear());

describe("the update notes themselves", () => {
  // Guards every future entry: a typo'd icon or a missing field would only
  // show up as a blank or broken card on somebody's phone.
  it("every update has a unique id, a title, a date and at least one item with a known icon", () => {
    expect(UPDATES.length).toBeGreaterThan(0);
    const ids = UPDATES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const u of UPDATES) {
      expect(u.title).toBeTruthy();
      expect(u.date).toBeTruthy();
      expect(u.items.length).toBeGreaterThan(0);
      for (const item of u.items) {
        expect(item.title).toBeTruthy();
        expect(item.text).toBeTruthy();
        expect(Object.keys(ICONS)).toContain(item.icon);
      }
    }
  });
});

describe("showing each update once", () => {
  it("is unseen until it's been opened, then stays seen", () => {
    expect(hasUnseenUpdate()).toBe(true);
    markUpdatesSeen();
    expect(hasUnseenUpdate()).toBe(false);
    expect(localStorage.getItem("techdesk_whatsnew_seen")).toBe(latestUpdateId());
  });

  it("a newer update than the one last seen counts as unseen again", () => {
    localStorage.setItem("techdesk_whatsnew_seen", "2000-01-01");
    expect(hasUnseenUpdate()).toBe(true);
  });

  it("can be opened from anywhere in the app", () => {
    const fn = vi.fn();
    const off = onOpenWhatsNew(fn);
    openWhatsNew();
    expect(fn).toHaveBeenCalled();
    off();
  });
});

describe("the What's new card", () => {
  it("shows the latest update's title and every item", () => {
    render(<ThemeProvider><WhatsNewModal onClose={() => {}} /></ThemeProvider>);
    expect(screen.getByRole("heading", { name: UPDATES[0].title })).toBeInTheDocument();
    for (const item of UPDATES[0].items) expect(screen.getByText(item.title)).toBeInTheDocument();
  });

  it("Got it closes it", () => {
    const onClose = vi.fn();
    render(<ThemeProvider><WhatsNewModal onClose={onClose} /></ThemeProvider>);
    fireEvent.click(screen.getByText("Got it"));
    expect(onClose).toHaveBeenCalled();
  });
});

// The X looked dead on a phone: it is positioned absolutely, and the card's
// content block -- positioned too, and later in the markup -- painted on top
// of it and took the taps. It needs to stay above that block.
describe("the close button", () => {
  it("closes the card", () => {
    const onClose = vi.fn();
    render(<ThemeProvider><WhatsNewModal onClose={onClose} /></ThemeProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("sits above the content that would otherwise cover it", () => {
    render(<ThemeProvider><WhatsNewModal onClose={() => {}} /></ThemeProvider>);
    expect(screen.getByRole("button", { name: "Close" }).className).toContain("z-10");
  });
});
