import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// The desktop app, unless a test says otherwise.
const shell = vi.hoisted(() => ({ desktop: true }));
vi.mock("./platform", async (orig) => ({ ...(await orig()), get IS_DESKTOP_APP() { return shell.desktop; } }));
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
    expect(src).toMatch(/IS_DESKTOP_APP/);
    // The buttons sit inside a shell check, not only inside a media class.
    const guard = src.indexOf("IS_DESKTOP_APP && (");
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
    expect(screen.getByTitle("Switch user")).toBeInTheDocument();
    expect(screen.getByTitle("Power off")).toBeInTheDocument();
  });

  it("never shows on the web app -- a phone in desktop-site mode is wide too", () => {
    shell.desktop = false;
    render(
      <MemoryRouter>
        <ThemeProvider><SettingsProvider><LicenseProvider><AuthProvider>
          <Sidebar onOpenActivation={() => {}} />
        </AuthProvider></LicenseProvider></SettingsProvider></ThemeProvider>
      </MemoryRouter>
    );
    expect(screen.queryByTitle("Switch user")).toBeNull();
    expect(screen.queryByTitle("Power off")).toBeNull();
    shell.desktop = true;
  });
});

describe("the Settings tabs", () => {
  const src = readFileSync(join(process.cwd(), "src/pages/SettingsPage.jsx"), "utf8");

  it("still hide the counter-only tab on a phone", () => {
    expect(src).toMatch(/counterOnly/);
    expect(src).toMatch(/IS_ANDROID_APP/);
  });
});

describe("the local multi-user PIN system, on the Users tab", () => {
  // A phone is one person's own device, not a shared counter -- there is no
  // one else to switch to a PIN for. AuthContext's pinRequired() already
  // never asks for one on Android regardless of this setting, so a toggle
  // and a local-user list that could not do anything on this shell would
  // just be confusing controls for a screen that can't appear. Online
  // workers -- a different, cloud system this phone connects to -- must
  // stay reachable regardless.
  const src = readFileSync(join(process.cwd(), "src/pages/settings/UsersTab.jsx"), "utf8");

  it("gates Require PIN sign-in and Local users behind IS_DESKTOP_APP", () => {
    const guard = src.indexOf("IS_DESKTOP_APP && (");
    expect(guard).toBeGreaterThan(-1);
    expect(src.indexOf("Require PIN sign-in")).toBeGreaterThan(guard);
    expect(src.indexOf("Local users")).toBeGreaterThan(guard);
  });

  it("never gates Online workers -- that's the cloud account, not the local PIN system", () => {
    // The exact fragment this guard wraps closes right before the Online
    // workers row is declared -- if that row ever moved inside the guard,
    // this literal boundary would move with it and this would stop finding it.
    const closesRightBeforeOnlineWorkers = src.indexOf("</>\n      )}\n\n      <SettingsRow\n        title=\"Online workers\"");
    expect(closesRightBeforeOnlineWorkers).toBeGreaterThan(-1);
  });
});
