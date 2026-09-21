import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Sidebar from "../components/Sidebar";
import { ThemeProvider } from "./ThemeContext";
import { AuthProvider } from "./AuthContext";
import { SettingsProvider } from "./SettingsContext";
import { LicenseProvider } from "./LicenseContext";

// A breakpoint answers "how much room is there", never "which app is this".
//
// The sidebar is hidden below the md breakpoint, which reads as "desktop
// only" and is not: turn a phone on its side and it is wide enough. So the
// desktop sidebar appeared on Android, with a switch-user button and a
// power-off button, on a shell that has neither staff accounts nor an app
// it is allowed to quit.
//
// This is the second time the same mistake shipped -- the Users tab was the
// first -- so it is worth a test rather than another fix.

describe("controls that belong to a counter, not a phone", () => {
  const src = readFileSync(join(process.cwd(), "src/components/Sidebar.jsx"), "utf8");

  it("are decided by the shell, not by how wide the window is", () => {
    expect(src).toMatch(/IS_ANDROID_APP/);
    // The buttons sit inside a shell check, not only inside a media class.
    const guard = src.indexOf("!IS_ANDROID_APP");
    expect(guard).toBeGreaterThan(-1);
    expect(src.indexOf('title="Switch user"')).toBeGreaterThan(guard);
    expect(src.indexOf('title="Power off"')).toBeGreaterThan(guard);
  });

  it("renders on a desktop, where they mean something", () => {
    render(
      <MemoryRouter>
        <ThemeProvider><SettingsProvider><LicenseProvider><AuthProvider>
          <Sidebar onOpenActivation={() => {}} />
        </AuthProvider></LicenseProvider></SettingsProvider></ThemeProvider>
      </MemoryRouter>
    );
    // jsdom is not the Capacitor shell, so this is the desktop/web case.
    expect(screen.getByTitle("Switch user")).toBeInTheDocument();
    expect(screen.getByTitle("Power off")).toBeInTheDocument();
  });
});

describe("the Settings tabs", () => {
  const src = readFileSync(join(process.cwd(), "src/pages/SettingsPage.jsx"), "utf8");

  it("still hide the counter-only tab on a phone", () => {
    expect(src).toMatch(/counterOnly/);
    expect(src).toMatch(/IS_ANDROID_APP/);
  });
});
