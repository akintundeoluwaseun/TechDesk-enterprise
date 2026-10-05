import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

const env = vi.hoisted(() => ({ platform: "android", version: "4.10.0", install: vi.fn() }));
vi.mock("./announcements", () => ({ appPlatform: () => env.platform, appVersion: () => env.version }));
vi.mock("./store", () => ({ PLAY_STORE: false }));
vi.mock("@techdesk/platform", () => ({ platform: () => ({ appUpdate: env.platform === "android" ? { install: env.install } : null, openExternal: vi.fn() }) }));

// eslint-disable-next-line import/first
import { useUpdateAvailable } from "./updateCheck";

const releases = [{ tag_name: "android-v4.11.0", assets: [{}] }, { tag_name: "v4.11.0", assets: [{}] }];
const fetchImpl = async () => ({ ok: true, json: async () => releases });
let api;
function Probe() {
  api = useUpdateAvailable({ fetchImpl });
  return <div>{api.version ? `${api.mode} ${api.version}` : "none"}</div>;
}

beforeEach(() => { localStorage.clear(); delete window.techdesk; env.install.mockReset(); });

describe("updates reach installed apps", () => {
  it("Android: offers to install inside the app, with the APK from the releases page", async () => {
    env.platform = "android";
    env.install.mockResolvedValue({ ok: true });
    render(<Probe />);
    await screen.findByText("android 4.11.0");
    await act(() => api.act());
    expect(env.install.mock.calls[0][0]).toBe("https://github.com/akintundeoluwaseun/TechDesk-releases-/releases/download/android-v4.11.0/TechDesk-4.11.0.apk");
  });

  it("Android: if installing inside the app fails, falls back to the download page", async () => {
    env.platform = "android";
    env.install.mockResolvedValue({ ok: false, error: "x" });
    render(<Probe />);
    await screen.findByText("android 4.11.0");
    await act(() => api.act());
    await screen.findByText("download 4.11.0");
  });

  it("Desktop: the app's own updater says ready, and Restart installs it", async () => {
    env.platform = "desktop";
    let push;
    const installUpdate = vi.fn().mockResolvedValue(true);
    window.techdesk = { updateStatus: async () => ({ state: "downloading", version: "4.11.0" }), onUpdateStatus: (fn) => { push = fn; return () => {}; }, installUpdate };
    render(<Probe />);
    await screen.findByText("downloading 4.11.0");
    act(() => push({ state: "ready", version: "4.11.0" }));
    await screen.findByText("restart 4.11.0");
    await act(() => api.act());
    expect(installUpdate).toHaveBeenCalled();
    act(() => api.later());
    await screen.findByText("none"); // put off: it installs by itself when TechDesk closes
  });

  it("nothing when already up to date", async () => {
    env.platform = "android";
    env.version = "4.11.0";
    render(<Probe />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByText("none")).toBeTruthy();
    env.version = "4.10.0";
  });
});
