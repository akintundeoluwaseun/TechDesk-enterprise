import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "../lib/ThemeContext";
import { SettingsProvider } from "../lib/SettingsContext";

// Typing in an activation code: every build has the box (and shows the PIN
// the code must be made for); the Google Play build has ONLY the box -- no
// prices, no checkout, no free test upgrade.

const store = vi.hoisted(() => ({ play: false }));
const { verifyCode, prices } = vi.hoisted(() => ({ verifyCode: vi.fn(), prices: vi.fn() }));

vi.mock("../lib/store", () => ({ get PLAY_STORE() { return store.play; }, STORE: "" }));
vi.mock("../lib/LicenseContext", async (importOriginal) => ({
  ...(await importOriginal()),
  useLicense: () => ({
    pin: "482913", tier: "free", boughtTier: "free", unlocks: [], verifyCode,
    licence: { found: false, paymentsLive: false }, refreshLicence: async () => null,
  }),
}));
vi.mock("@techdesk/core", async (importOriginal) => ({
  ...(await importOriginal()),
  checkout: { available: () => true, prices, startOrder: vi.fn(), claimCode: vi.fn(), trialUnlock: vi.fn() },
}));

// eslint-disable-next-line import/first
import ActivationModal from "./ActivationModal";

const open = () => render(<ThemeProvider><SettingsProvider><ActivationModal onClose={() => {}} /></SettingsProvider></ThemeProvider>);

beforeEach(() => {
  verifyCode.mockReset();
  prices.mockResolvedValue({ business: { amount: 10000 }, enterprise: { amount: 20000 } });
});

describe("activation code box", () => {
  it("is one tap away on the normal build, shows the PIN, and applies a good code", async () => {
    store.play = false;
    verifyCode.mockResolvedValue({ ok: true, applied: true, tier: "enterprise" });
    open();
    expect(screen.getAllByText(/Upgrade to/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Have an activation code?"));
    expect(screen.getByText("482913")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Activation code"), { target: { value: "7kq29xhm4tra" } });
    expect(screen.getByLabelText("Activation code").value).toBe("7KQ2-9XHM-4TRA");
    fireEvent.click(screen.getByText("Apply code"));
    await waitFor(() => expect(verifyCode).toHaveBeenCalledWith("7KQ2-9XHM-4TRA"));
    await waitFor(() => expect(screen.getAllByText(/Enterprise is on/).length).toBeGreaterThan(0));
  });

  it("says plainly when a code isn't for this device", async () => {
    store.play = false;
    verifyCode.mockResolvedValue({ ok: false, applied: false, tier: null });
    open();
    fireEvent.click(screen.getByText("Have an activation code?"));
    fireEvent.change(screen.getByLabelText("Activation code"), { target: { value: "AAAABBBBCCCC" } });
    fireEvent.click(screen.getByText("Apply code"));
    await waitFor(() => expect(screen.getByText(/doesn't match this device/)).toBeTruthy());
  });

  it("is the only way in on the Play Store build: no prices, no upgrade buttons, no paying", async () => {
    store.play = true;
    open();
    expect(screen.queryByText(/Upgrade to/)).toBeNull();
    expect(screen.queryByText(/Free while we test/)).toBeNull();
    expect(screen.queryByText(/₦/)).toBeNull();
    expect(screen.queryByText(/Paid already/)).toBeNull();
    expect(screen.getByLabelText("Activation code")).toBeTruthy();
    expect(screen.getByText("482913")).toBeTruthy();
  });
});
