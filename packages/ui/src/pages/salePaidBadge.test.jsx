import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SalesPage from "./SalesPage";
import { ThemeProvider } from "../lib/ThemeContext";
import { AuthProvider } from "../lib/AuthContext";
import { SettingsProvider } from "../lib/SettingsContext";
import { LicenseProvider } from "../lib/LicenseContext";
import { HelpProvider } from "../lib/HelpContext";

// Two things a shop told us about, on the same sale.
//
// A sale paid in full still sat in the list saying "Pending", because the
// word was written once when the sale was saved and the amount could change
// afterwards -- by an edit, a part payment, the assistant -- with nothing
// going back to correct the word. Every money figure in the app came off the
// amount; only the badge the shop actually reads came off the word.
//
// And a receipt would print off a sale in that state without a murmur, which
// is the shop handing a customer a document that contradicts its own books.

const PAID_IN_FULL = {
  id: "s1",
  invoice: "INV-001",
  createdAt: new Date().toISOString(),
  customerName: "Bright Tech Hub",
  items: [{ name: "Screen guard", qty: 2, price: 1250 }],
  total: 2500,
  amountPaid: 2500,
  paymentStatus: "Pending",   // the stale word
  paymentMethod: "Cash",
};

const STILL_OWING = {
  ...PAID_IN_FULL,
  id: "s2",
  invoice: "INV-002",
  amountPaid: 1000,
};

function show(sales) {
  localStorage.setItem("techdesk_sales", JSON.stringify(sales));
  localStorage.setItem(
    "techdesk_user",
    JSON.stringify({ id: "u1", name: "Owner", role: "admin" }),
  );
  return render(
    <MemoryRouter>
      <ThemeProvider><SettingsProvider><LicenseProvider><AuthProvider><HelpProvider>
        <SalesPage />
      </HelpProvider></AuthProvider></LicenseProvider></SettingsProvider></ThemeProvider>
    </MemoryRouter>,
  );
}

// The badge, not the dropdown underneath it: the dropdown lists every status
// as an <option>, so a plain text match finds "Paid" on a sale that is not.
function badge(word) {
  return screen.queryAllByText(word).filter((el) => el.tagName === "SPAN");
}

describe("a sale that has been paid for says so", () => {
  beforeEach(() => localStorage.clear());

  it("shows Paid when the amount covers the total, whatever was stored", () => {
    show([PAID_IN_FULL]);
    expect(badge("Paid")).toHaveLength(1);
    expect(badge("Pending")).toHaveLength(0);
    // And the dropdown agrees, so it does not offer to "change" it to what it
    // already is.
    expect(screen.getByDisplayValue("Paid")).toBeInTheDocument();
  });

  it("still shows Pending when nothing has come in", () => {
    show([{ ...PAID_IN_FULL, amountPaid: 0, paymentStatus: "Pending" }]);
    expect(badge("Pending")).toHaveLength(1);
    expect(badge("Paid")).toHaveLength(0);
  });
});

describe("printing a receipt that is not settled asks first", () => {
  beforeEach(() => localStorage.clear());

  it("asks, and names what is still owing", () => {
    show([STILL_OWING]);
    fireEvent.click(screen.getByText("Print"));
    expect(screen.getByText(/still says partial/i)).toBeInTheDocument();
    // The balance is on the card so the answer does not rest on remembering it.
    expect(screen.getByText(/1,500/)).toBeInTheDocument();
  });

  it("lets the shop carry on -- shops do print on part payment", () => {
    show([STILL_OWING]);
    fireEvent.click(screen.getByText("Print"));
    fireEvent.click(screen.getByText("Print anyway"));
    // The question is gone and the print went ahead (the size picker opens).
    expect(screen.queryByText(/still says/i)).not.toBeInTheDocument();
  });

  it("does not ask on a sale that is paid", () => {
    show([PAID_IN_FULL]);
    fireEvent.click(screen.getByText("Print"));
    expect(screen.queryByText(/still says/i)).not.toBeInTheDocument();
  });
});
