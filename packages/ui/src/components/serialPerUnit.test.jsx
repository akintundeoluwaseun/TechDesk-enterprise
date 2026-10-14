import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NewSaleModal from "./NewSaleModal";
import { ThemeProvider } from "../lib/ThemeContext";
import { AuthProvider } from "../lib/AuthContext";
import { SettingsProvider } from "../lib/SettingsContext";
import { LicenseProvider } from "../lib/LicenseContext";
import { HelpProvider } from "../lib/HelpContext";
import { db } from "../lib/db";

// Two of the same laptop are two machines with two different serials, and the
// sale line carried one box between them -- so the second machine's number was
// never asked for and never reached the receipt. The serial is the number a
// customer comes back with when a machine is stolen or fails under warranty,
// and a receipt naming one of the two devices they walked out with is worse
// than one naming neither.

const LAPTOP = {
  id: "p1",
  name: "HP EliteBook",
  sku: "HP-840",
  category: "Laptops",
  price: 250000,
  costPrice: 200000,
  stock: 5,
};

function open(props = {}) {
  localStorage.setItem("techdesk_inventory", JSON.stringify([LAPTOP]));
  localStorage.setItem(
    "techdesk_user",
    JSON.stringify({ id: "u1", name: "Owner", role: "admin" }),
  );
  return render(
    <MemoryRouter>
      <ThemeProvider><SettingsProvider><LicenseProvider><AuthProvider><HelpProvider>
        <NewSaleModal onClose={() => {}} onCompleted={() => {}} {...props} />
      </HelpProvider></AuthProvider></LicenseProvider></SettingsProvider></ThemeProvider>
    </MemoryRouter>,
  );
}

// The name shows in the picker AND again on the cart line once it is added,
// so the first click has to be the picker's copy; after that the quantity
// buttons are the real way a shop adds a second one anyway.
function addLaptop(qty = 1) {
  fireEvent.click(screen.getAllByText("HP EliteBook")[0]);
  for (let i = 1; i < qty; i++) fireEvent.click(qtyButton("plus"));
}

function qtyButton(which) {
  return screen
    .getAllByRole("button")
    .find((b) => b.querySelector(`.lucide-${which}`));
}

describe("selling two of the same device asks for both serials", () => {
  beforeEach(() => localStorage.clear());

  it("shows one serial box per unit, numbered", () => {
    open();
    addLaptop(2);
    expect(screen.getByPlaceholderText("Serial for unit 1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Serial for unit 2")).toBeInTheDocument();
  });

  it("leaves a single unit exactly as it was -- one box, no numbering", () => {
    open();
    addLaptop(1);
    expect(screen.getByPlaceholderText("IMEI / serial number")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Serial for unit 1")).not.toBeInTheDocument();
  });

  it("saves both serials against the line", () => {
    open();
    addLaptop(2);
    fireEvent.change(screen.getByPlaceholderText("Serial for unit 1"), { target: { value: "SN-AAA111" } });
    fireEvent.change(screen.getByPlaceholderText("Serial for unit 2"), { target: { value: "SN-BBB222" } });
    fireEvent.click(screen.getByText("Complete Sale"));

    const [sale] = db.getSales();
    expect(sale.items[0].qty).toBe(2);
    expect(sale.items[0].imeis).toEqual(["SN-AAA111", "SN-BBB222"]);
    // And the single field everything else already reads carries both, so the
    // invoice column, the WhatsApp token and search keep working untouched.
    expect(sale.items[0].imei).toBe("SN-AAA111, SN-BBB222");
  });

  it("keeps what was typed when a unit is taken back off the line", () => {
    open();
    addLaptop(2);
    fireEvent.change(screen.getByPlaceholderText("Serial for unit 1"), { target: { value: "SN-AAA111" } });
    // The minus button on the line.
    fireEvent.click(qtyButton("minus"));
    expect(screen.getByPlaceholderText("IMEI / serial number")).toHaveValue("SN-AAA111");
  });

  it("re-opens an older sale that only ever stored one serial", () => {
    // Saved before serials were per-unit: one string for the whole line.
    const sale = {
      id: "s1",
      invoice: "INV-009",
      createdAt: new Date().toISOString(),
      items: [{ productId: "p1", name: "HP EliteBook", price: 250000, qty: 2, imei: "SN-OLD999", fromInventory: true }],
      total: 500000,
      amountPaid: 500000,
    };
    open({ sale });
    expect(screen.getByPlaceholderText("Serial for unit 1")).toHaveValue("SN-OLD999");
    expect(screen.getByPlaceholderText("Serial for unit 2")).toHaveValue("");
  });
});
