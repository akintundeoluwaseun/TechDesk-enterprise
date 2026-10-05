import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "../lib/ThemeContext";
import { SettingsProvider } from "../lib/SettingsContext";

// Yearly plans on the upgrade screen: a Business shop pays the upgrade price
// for Enterprise, an Enterprise shop can buy extra head-office branches, and
// the prices shown are the server's.

const state = vi.hoisted(() => ({ tier: "business", upgrade: null, paymentsLive: true }));
const { verifyCode, startOrder, claimCode, payWithFlutterwave, prices, trialUnlock } = vi.hoisted(() => ({
  trialUnlock: vi.fn(),
  verifyCode: vi.fn(),
  startOrder: vi.fn(),
  claimCode: vi.fn(),
  payWithFlutterwave: vi.fn(),
  prices: vi.fn(),
}));

vi.mock("../lib/LicenseContext", async (importOriginal) => ({
  ...(await importOriginal()),
  useLicense: () => ({
    pin: "482913",
    tier: state.tier,
    boughtTier: state.tier,
    unlocks: [],
    verifyCode,
    licence: { found: true, tier: state.tier, expiresAt: "2027-09-30T00:00:00Z", upgrade: state.upgrade, paymentsLive: state.paymentsLive },
    refreshLicence: async () => null,
  }),
}));

vi.mock("@techdesk/core", async (importOriginal) => ({
  ...(await importOriginal()),
  checkout: { available: () => true, startOrder, claimCode, prices, trialUnlock },
}));

vi.mock("../lib/flutterwave", () => ({ payWithFlutterwave }));

// eslint-disable-next-line import/first
import ActivationModal from "./ActivationModal";

// The in-app checkout is what these test, so it is switched on here (the app ships codes-only).
vi.mock("../lib/store", () => ({ PLAY_STORE: false, CODES_ONLY: false, STORE: "" }));

function open() {
  return render(
    <ThemeProvider>
      <SettingsProvider>
        <ActivationModal onClose={() => {}} />
      </SettingsProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  [verifyCode, startOrder, claimCode, payWithFlutterwave, prices, trialUnlock].forEach((f) => f.mockReset());
  prices.mockResolvedValue({
    business: { amount: 10000 }, enterprise: { amount: 20000 },
    upgrade_enterprise: { amount: 10000 }, branch: { amount: 5000 },
  });
  payWithFlutterwave.mockResolvedValue({ attempted: true });
});

describe("while payments are off", () => {
  it("Upgrade is free: no payment, the server's trial licence instead", async () => {
    state.tier = "free";
    state.paymentsLive = false;
    trialUnlock.mockResolvedValue({ ok: true, tier: "enterprise", trial: true });
    open();
    fireEvent.click(screen.getByRole("button", { name: /Pay online/i }));
    expect(screen.getAllByText(/Free while we test/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Activate Enterprise/i }));
    fireEvent.click(screen.getByRole("button", { name: /Upgrade free while we test/i }));
    await waitFor(() => expect(trialUnlock).toHaveBeenCalledWith("482913", "enterprise"));
    expect(startOrder).not.toHaveBeenCalled();
    expect(payWithFlutterwave).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/free while TechDesk is being tested/)).toBeTruthy());
    state.paymentsLive = true;
    state.tier = "business";
  });
});

describe("yearly plans", () => {
  it("the upgrade shows only what is left of the Business year", async () => {
    state.tier = "business";
    state.upgrade = { eligible: true, amount: 830, full: 10000, daysLeft: 30 };
    open();
    fireEvent.click(screen.getByRole("button", { name: /Pay online/i }));
    await waitFor(() => expect(screen.getByText(/₦830 for the rest of your Business year/)).toBeTruthy());
    state.upgrade = null;
  });

  it("a Business shop upgrades to Enterprise at the upgrade price", async () => {
    state.tier = "business";
    startOrder.mockResolvedValue({ ok: true, txRef: "td-u", amount: 10000, currency: "NGN" });
    claimCode.mockResolvedValue({ ok: true, code: "E-CODE", tier: "enterprise", expiresAt: "2027-09-30T00:00:00Z" });
    verifyCode.mockResolvedValue({ ok: true, applied: true, tier: "enterprise" });

    open();
    fireEvent.click(screen.getByRole("button", { name: /Pay online/i }));
    await waitFor(() => expect(screen.getByText(/₦10,000 for the rest of your Business year/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Upgrade Business → Enterprise/i }));
    fireEvent.click(screen.getByRole("button", { name: /Pay with card/i }));
    fireEvent.change(screen.getByLabelText(/Email for the receipt/i), { target: { value: "shop@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to payment/i }));

    await waitFor(() =>
      expect(startOrder).toHaveBeenCalledWith({ pin: "482913", tier: "enterprise", product: "upgrade", contact: "shop@example.com" }),
    );
    await waitFor(() => expect(screen.getByText(/is on until/)).toBeTruthy());
  });

  it("offers a renewal, and a renewal that re-sends the same code is a success, not an error", async () => {
    state.tier = "business";
    startOrder.mockResolvedValue({ ok: true, txRef: "td-r", amount: 10000, currency: "NGN" });
    claimCode.mockResolvedValue({ ok: true, code: "B-CODE", tier: "business", expiresAt: "2028-09-30T00:00:00Z" });
    verifyCode.mockResolvedValue({ ok: true, applied: false, tier: "business" });

    open();
    fireEvent.click(screen.getByRole("button", { name: /Pay online/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Renew TechDesk Business/i }));
    fireEvent.click(screen.getByRole("button", { name: /Pay with card/i }));
    fireEvent.change(screen.getByLabelText(/Email for the receipt/i), { target: { value: "shop@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to payment/i }));

    await waitFor(() =>
      expect(startOrder).toHaveBeenCalledWith({ pin: "482913", tier: "business", product: "plan", contact: "shop@example.com" }),
    );
    await waitFor(() => expect(screen.getByText(/renewed until/)).toBeTruthy());
  });

  it("an Enterprise shop buys extra branches for its head office", async () => {
    state.tier = "enterprise";
    startOrder.mockResolvedValue({ ok: true, txRef: "td-b", amount: 10000, currency: "NGN" });
    claimCode.mockResolvedValue({ ok: true, code: null, tier: "enterprise", expiresAt: "2027-09-30T00:00:00Z" });

    open();
    fireEvent.click(screen.getByRole("button", { name: /Pay online/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Add head-office branches/i }));
    fireEvent.change(screen.getByLabelText(/head office’s email or phone/i), { target: { value: "hq@shop.com" } });
    fireEvent.change(screen.getByLabelText(/How many extra branches/i), { target: { value: "2" } });
    expect(screen.getByText("₦10,000 a year")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Continue$/ }));
    fireEvent.change(screen.getByLabelText(/Email for the receipt/i), { target: { value: "owner@shop.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to payment/i }));

    await waitFor(() =>
      expect(startOrder).toHaveBeenCalledWith({ product: "branch", quantity: 2, hqIdentity: "hq@shop.com", contact: "owner@shop.com" }),
    );
    await waitFor(() => expect(screen.getByText(/can connect more branches until/)).toBeTruthy());
    expect(verifyCode).not.toHaveBeenCalled();
  });
});
