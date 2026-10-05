import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "../lib/ThemeContext";
import { SettingsProvider } from "../lib/SettingsContext";

// The button next to the PIN-and-code path, for a shop that would rather pay
// by card, bank transfer or USSD than read a PIN out over the phone.
//
// verifyCode's own cryptography is exhaustively covered elsewhere
// (activationTable.test.js, activationRealCodes.test.js against the real
// codes) -- these pin the ORCHESTRATION instead: an order is started, the
// widget opens, the code is claimed only from the server (never trusted
// because a browser callback said "success"), and a webhook still catching
// up is a "check again", not a second charge.

const { verifyCode, startOrder, claimCode, payWithFlutterwave } = vi.hoisted(() => ({
  verifyCode: vi.fn(),
  startOrder: vi.fn(),
  claimCode: vi.fn(),
  payWithFlutterwave: vi.fn(),
}));

vi.mock("../lib/LicenseContext", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useLicense: () => ({ pin: "482913", tier: "free", unlocks: [], verifyCode }),
  };
});

vi.mock("@techdesk/core", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, checkout: { available: () => true, startOrder, claimCode } };
});

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

function goToEmailStep(email) {
  fireEvent.click(screen.getByRole("button", { name: /Pay online/i }));
  fireEvent.click(screen.getByRole("button", { name: /Activate Business/i }));
  fireEvent.click(screen.getByRole("button", { name: /Pay with card/i }));
  fireEvent.change(screen.getByLabelText(/Email for the receipt/i), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /Continue to payment/i }));
}

beforeEach(() => {
  verifyCode.mockReset();
  startOrder.mockReset();
  claimCode.mockReset();
  payWithFlutterwave.mockReset();
});

describe("paying for an upgrade online", () => {
  it("starts an order, opens the widget, claims the code, and applies it", async () => {
    startOrder.mockResolvedValue({ ok: true, txRef: "td-1", amount: 8000, currency: "NGN", publicKey: "FLWPUBK-x" });
    payWithFlutterwave.mockResolvedValue({ attempted: true });
    claimCode.mockResolvedValue({ ok: true, code: "ABCD-EFGH-IJKL", tier: "business" });
    verifyCode.mockResolvedValue({ ok: true, applied: true, tier: "business" });

    open();
    goToEmailStep("shop@example.com");

    await waitFor(() =>
      expect(startOrder).toHaveBeenCalledWith({ pin: "482913", tier: "business", product: "plan", contact: "shop@example.com" }),
    );
    await waitFor(() => expect(payWithFlutterwave).toHaveBeenCalled());
    await waitFor(() => expect(claimCode).toHaveBeenCalledWith("td-1"));
    await waitFor(() => expect(verifyCode).toHaveBeenCalledWith("ABCD-EFGH-IJKL"));
    await waitFor(() =>
      expect(screen.getByText(/Done\. TechDesk Business is on/i)).toBeInTheDocument(),
    );
  });

  it("offers to check again when the webhook has not arrived yet, without paying twice", async () => {
    startOrder.mockResolvedValue({ ok: true, txRef: "td-2", amount: 8000, currency: "NGN", publicKey: "FLWPUBK-x" });
    payWithFlutterwave.mockResolvedValue({ attempted: true });
    claimCode.mockResolvedValueOnce({
      ok: false,
      error: "not_paid",
      message: "We haven't seen the payment yet. Give it a moment and try again.",
    });

    open();
    goToEmailStep("shop@example.com");

    await waitFor(() => expect(screen.getByText(/haven't seen the payment yet/i)).toBeInTheDocument());
    expect(startOrder).toHaveBeenCalledTimes(1);

    claimCode.mockResolvedValueOnce({ ok: true, code: "ABCD-EFGH-IJKL", tier: "business" });
    verifyCode.mockResolvedValue({ ok: true, applied: true, tier: "business" });
    fireEvent.click(screen.getByRole("button", { name: /Check again/i }));

    await waitFor(() => expect(claimCode).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByText(/Done\. TechDesk Business is on/i)).toBeInTheDocument(),
    );
    // Confirming a slow webhook never re-runs the order -- that would be a
    // second charge for the same upgrade.
    expect(startOrder).toHaveBeenCalledTimes(1);
  });

  it("will not start an order without an email", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Pay online/i }));
    fireEvent.click(screen.getByRole("button", { name: /Activate Business/i }));
    fireEvent.click(screen.getByRole("button", { name: /Pay with card/i }));
    fireEvent.click(screen.getByRole("button", { name: /Continue to payment/i }));
    expect(screen.getByText(/Enter an email/i)).toBeInTheDocument();
    expect(startOrder).not.toHaveBeenCalled();
  });

  it("passes on the server's own reason when the order itself is refused", async () => {
    startOrder.mockResolvedValue({ ok: false, message: "That plan is not on sale yet. Please contact us." });

    open();
    goToEmailStep("shop@example.com");

    await waitFor(() => expect(screen.getByText(/not on sale yet/i)).toBeInTheDocument());
    expect(payWithFlutterwave).not.toHaveBeenCalled();
  });

  it("can buy Enterprise straight from free, skipping Business entirely", async () => {
    startOrder.mockResolvedValue({ ok: true, txRef: "td-3", amount: 20000, currency: "NGN", publicKey: "FLWPUBK-x" });
    payWithFlutterwave.mockResolvedValue({ attempted: true });
    claimCode.mockResolvedValue({ ok: true, code: "ABCD-EFGH-IJKL", tier: "enterprise" });
    verifyCode.mockResolvedValue({ ok: true, applied: true, tier: "enterprise" });

    open();
    fireEvent.click(screen.getByRole("button", { name: /Pay online/i }));
    fireEvent.click(screen.getByRole("button", { name: /Activate Enterprise/i }));
    fireEvent.click(screen.getByRole("button", { name: /Pay with card/i }));
    fireEvent.change(screen.getByLabelText(/Email for the receipt/i), { target: { value: "shop@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to payment/i }));

    await waitFor(() =>
      expect(startOrder).toHaveBeenCalledWith({ pin: "482913", tier: "enterprise", product: "plan", contact: "shop@example.com" }),
    );
    await waitFor(() =>
      expect(screen.getByText(/Done\. TechDesk Enterprise is on/i)).toBeInTheDocument(),
    );
  });
});
