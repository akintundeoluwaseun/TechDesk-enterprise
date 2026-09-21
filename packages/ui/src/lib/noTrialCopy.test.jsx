import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import MobileAppBar from "../components/MobileAppBar";
import ActivationModal from "../components/ActivationModal";
import { ThemeProvider } from "./ThemeContext";
import { AuthProvider } from "./AuthContext";
import { SettingsProvider } from "./SettingsContext";
import { LicenseProvider } from "./LicenseContext";
import { HelpProvider } from "./HelpContext";

// TechDesk has no trial. It had one -- seven days, then the app locked -- and
// the countdown was taken out long before the words were. Months later a shop
// on the free app was still being asked "Trial still running?", about a
// product that never stops.
//
// The trial machinery is still in the source, because old installs have that
// state on disk and losing it would look like losing their data. That is
// exactly why this test reads the RENDERED screens rather than the files: the
// bookkeeping may say "trial" all it likes, as long as nobody is shown it.

function mount(node) {
  return render(
    <MemoryRouter>
      <ThemeProvider><SettingsProvider><LicenseProvider><AuthProvider><HelpProvider>
        {node}
      </HelpProvider></AuthProvider></LicenseProvider></SettingsProvider></ThemeProvider>
    </MemoryRouter>
  );
}

describe("what a shop is told about expiry", () => {
  const screens = [
    ["the sidebar", <Sidebar onOpenActivation={() => {}} />],
    ["the phone app bar", <MobileAppBar onOpenActivation={() => {}} />],
    ["the upgrade screen", <ActivationModal onClose={() => {}} />],
  ];

  for (const [name, node] of screens) {
    it(`${name} never says trial`, () => {
      const { container, unmount } = mount(node);
      const text = container.textContent || "";
      const said = [...text.matchAll(/trial/gi)].map(
        (m) => text.slice(Math.max(0, m.index - 30), m.index + 30).trim()
      );
      expect(said).toEqual([]);
      unmount();
    });
  }

  it("catches it when the word does come back", () => {
    const { container } = mount(<p>Your 7-day trial has ended</p>);
    expect(/trial/i.test(container.textContent)).toBe(true);
  });
});
