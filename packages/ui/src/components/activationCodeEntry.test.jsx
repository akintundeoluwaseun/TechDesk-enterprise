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

vi.mock("../lib/store", () => ({ get PLAY_STORE() { return store.play; }, get CODES_ONLY() { return !!store.codes; }, STORE: "" }));
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
  it("I have a code: shows the PIN, and applies a good code", async () => {
    store.play = false;
    verifyCode.mockResolvedValue({ ok: true, applied: true, tier: "enterprise" });
    open();
    fireEvent.click(screen.getByRole("button", { name: /I have a code/i }));
    expect(screen.getByText("482913")).toBeTruthy();
    expect(screen.getByText(/Send PIN on WhatsApp/).closest("a").getAttribute("href")).toMatch(/^https:\/\/wa\.me\/2348076911614\?text=.*482913/);
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
    fireEvent.click(screen.getByRole("button", { name: /I have a code/i }));
    fireEvent.change(screen.getByLabelText("Activation code"), { target: { value: "AAAABBBBCCCC" } });
    fireEvent.click(screen.getByText("Apply code"));
    await waitFor(() => expect(screen.getByText(/doesn't match this device/)).toBeTruthy());
  });

  it("still takes the one-time codes, with their prefix", async () => {
    store.play = false;
    verifyCode.mockResolvedValue({ ok: false, applied: false, tier: null, message: "That code has already been used on another device." });
    open();
    fireEvent.click(screen.getByRole("button", { name: /I have a code/i }));
    fireEvent.change(screen.getByLabelText("Activation code"), { target: { value: "bus 7k2m q9tx 4hpa" } });
    expect(screen.getByLabelText("Activation code").value).toBe("BUS-7K2M-Q9TX-4HPA");
    fireEvent.click(screen.getByText("Apply code"));
    await waitFor(() => expect(screen.getByText(/already been used on another device/)).toBeTruthy());
  });

  it("on the Play Store build there is no paying: only I have a code", async () => {
    store.play = true;
    open();
    expect(screen.queryByRole("button", { name: /Pay online/i })).toBeNull();
    expect(screen.queryByText(/₦/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /I have a code/i }));
    expect(screen.getByLabelText("Activation code")).toBeTruthy();
    expect(screen.getByText("482913")).toBeTruthy();
    store.play = false;
  });
});
