import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "../lib/ThemeContext";
import { SettingsProvider } from "../lib/SettingsContext";

// The Play Store build: paying is Google Play, checked by the server.
const { billing, playVerify, grantFromServer, lic } = vi.hoisted(() => ({
  billing: {
    ids: { business: "techdesk_business_1m", enterprise: "techdesk_enterprise_1m", upgrade: "techdesk_upgrade_enterprise" },
    prices: vi.fn(), buy: vi.fn(), unfinished: vi.fn(), finish: vi.fn(),
  },
  playVerify: vi.fn(),
  grantFromServer: vi.fn(),
  lic: { tier: "free" },
}));
vi.mock("../lib/store", () => ({ PLAY_STORE: true, STORE: "play" }));
vi.mock("@techdesk/platform", async (orig) => ({ ...(await orig()), platform: () => ({ billing }) }));
vi.mock("../lib/LicenseContext", async (orig) => ({
  ...(await orig()),
  useLicense: () => ({
    pin: "482913", tier: lic.tier, boughtTier: lic.tier, unlocks: [], verifyCode: vi.fn(), grantFromServer,
    licence: { found: false, paymentsLive: true }, refreshLicence: async () => null,
  }),
}));
vi.mock("@techdesk/core", async (orig) => ({
  ...(await orig()),
  checkout: { available: () => true, prices: vi.fn(async () => ({})), playVerify, startOrder: vi.fn(), claimCode: vi.fn() },
}));

// eslint-disable-next-line import/first
import ActivationModal from "./ActivationModal";
const open = () => render(<ThemeProvider><SettingsProvider><ActivationModal onClose={() => {}} /></SettingsProvider></ThemeProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  lic.tier = "free";
  billing.prices.mockResolvedValue({ techdesk_business_1m: "$5.00", techdesk_enterprise_1m: "$10.00", techdesk_upgrade_enterprise: "$5.00" });
  billing.unfinished.mockResolvedValue([]);
  billing.finish.mockResolvedValue();
});

describe("Play Store build: Google Play", () => {
  it("shows Pay with Google Play and I have a code, with Google's prices", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Pay with Google Play/i }));
    await waitFor(() => expect(screen.getByText(/\$5\.00 a month/)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Activate Enterprise/i })).toBeEnabled();
    expect(screen.queryByText(/card, bank transfer or USSD/i)).toBeNull();
  });

  it("buys with Google, has the server check it, switches it on, then consumes it", async () => {
    billing.buy.mockResolvedValue({ productId: "techdesk_business_1m", token: "TOK", paid: true });
    playVerify.mockResolvedValue({ ok: true, kind: "business", tier: "business", expiresAt: "2027-10-05T00:00:00Z" });
    grantFromServer.mockResolvedValue({ ok: true, applied: true, tier: "business", expiresAt: "2027-10-05T00:00:00Z" });
    open();
    fireEvent.click(screen.getByRole("button", { name: /Pay with Google Play/i }));
    fireEvent.click(screen.getByRole("button", { name: /Activate Business/i }));
    await waitFor(() => expect(billing.finish).toHaveBeenCalledWith("TOK"));
    expect(billing.buy).toHaveBeenCalledWith("techdesk_business_1m", "pin-482913");
    expect(playVerify).toHaveBeenCalledWith("482913", "techdesk_business_1m", "TOK");
    expect(grantFromServer.mock.calls[0][1]).toBe("PLAY:TOK");
    await waitFor(() => expect(screen.getByText(/Done\. TechDesk Business is on/)).toBeTruthy());
  });

  it("doesn't consume a purchase the server couldn't confirm (it's retried next time)", async () => {
    billing.buy.mockResolvedValue({ productId: "techdesk_business_1m", token: "TOK", paid: true });
    playVerify.mockResolvedValue({ ok: false, error: "google", message: "Couldn't check the purchase with Google just now." });
    grantFromServer.mockResolvedValue({ ok: false, message: "Couldn't check the purchase with Google just now." });
    open();
    fireEvent.click(screen.getByRole("button", { name: /Pay with Google Play/i }));
    fireEvent.click(screen.getByRole("button", { name: /Activate Business/i }));
    await waitFor(() => expect(screen.getByText(/Couldn't check the purchase/)).toBeTruthy());
    expect(billing.finish).not.toHaveBeenCalled();
  });

  it("finishes a purchase left over from last time when the screen opens", async () => {
    billing.unfinished.mockResolvedValue([{ productId: "techdesk_enterprise_1m", token: "OLD", paid: true }]);
    playVerify.mockResolvedValue({ ok: true, tier: "enterprise" });
    grantFromServer.mockResolvedValue({ ok: true, applied: true, tier: "enterprise" });
    open();
    await waitFor(() => expect(billing.finish).toHaveBeenCalledWith("OLD"));
    expect(billing.unfinished).toHaveBeenCalledWith("pin-482913");
  });

  it("a Business shop can upgrade or renew; backing out of Google's sheet is not an error", async () => {
    lic.tier = "business";
    billing.buy.mockRejectedValue(new Error("User cancelled"));
    open();
    fireEvent.click(screen.getByRole("button", { name: /Pay with Google Play/i }));
    expect(screen.getByRole("button", { name: /Renew Business/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Activate Enterprise/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Upgrade Business → Enterprise/i }));
    await waitFor(() => expect(billing.buy).toHaveBeenCalledWith("techdesk_upgrade_enterprise", "pin-482913"));
    expect(screen.queryByText(/couldn't finish/i)).toBeNull();
  });
});
