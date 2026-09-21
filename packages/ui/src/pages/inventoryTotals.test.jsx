import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import InventoryPage from "./InventoryPage";
import { ThemeProvider } from "../lib/ThemeContext";
import { AuthProvider } from "../lib/AuthContext";
import { SettingsProvider } from "../lib/SettingsContext";
import { LicenseProvider } from "../lib/LicenseContext";
import { HelpProvider } from "../lib/HelpContext";

// What a shop counting stock actually wants to know.
//
// The page said "4 in stock" and meant four LINES in the list -- a shop with
// four products and a dozen of each was told four. And every line showed the
// price of one, so working out what was on the shelf meant doing the
// multiplication by hand, on every row, every time.

const STOCK = [
  { id: "p1", name: "S21 screen", sku: "SCR-S21", category: "Screens", price: 8000, stock: 4 },
  { id: "p2", name: "iPhone 11 battery", sku: "BAT-I11", category: "Batteries", price: 6500, stock: 12 },
  { id: "p3", name: "Type-C cable", sku: "CAB-C", category: "Accessories", price: 1500, stock: 30 },
];

function show(rows = STOCK) {
  localStorage.setItem("techdesk_inventory", JSON.stringify(rows));
  return render(
    <MemoryRouter>
      <ThemeProvider><SettingsProvider><LicenseProvider><AuthProvider><HelpProvider>
        <InventoryPage />
      </HelpProvider></AuthProvider></LicenseProvider></SettingsProvider></ThemeProvider>
    </MemoryRouter>,
  );
}

describe("the inventory counts things, not lines", () => {
  beforeEach(() => localStorage.clear());

  it("says how many items are on the shelf, not just how many products", () => {
    show();
    // 4 + 12 + 30. The old line said "3", which is the number of rows.
    expect(screen.getByText(/46 items on the shelf/)).toBeInTheDocument();
    expect(screen.getByText(/3 products/)).toBeInTheDocument();
  });

  it("shows what the stock of each product is worth, not the price of one", () => {
    const { container } = show();
    const text = container.textContent;
    expect(text).toContain("×4");
    // 4 x 8,000. Shown next to the unit price, because the unit price alone
    // is the number the shop has to multiply in their head.
    expect(text).toMatch(/32,000/);
    expect(text).toMatch(/78,000/);
    expect(text).toMatch(/45,000/);
  });

  it("adds up what is on screen", () => {
    show();
    // 32,000 + 78,000 + 45,000. Twice on purpose: the header totals the shop,
    // the row under the list totals what is being looked at, and with no
    // filter on they are the same number.
    expect(screen.getAllByText(/155,000/).length).toBeGreaterThan(0);
  });

  it("does not let a negative count take stock away from the total", () => {
    // It happens: a sale rung up twice, a count corrected later. Letting it
    // subtract would quietly report less stock, and less value, than the shop
    // has -- and a shop that trusts the number would under-order.
    show([...STOCK, { id: "p4", name: "Mystery", price: 5000, stock: -3 }]);
    expect(screen.getByText(/46 items on the shelf/)).toBeInTheDocument();
    expect(screen.getAllByText(/155,000/).length).toBeGreaterThan(0);
  });

  it("says nothing about value for a product with none in stock", () => {
    const { container } = show([{ id: "p9", name: "Out of it", price: 5000, stock: 0 }]);
    // Zero times anything is zero, and a row reading "x0 = 0" is noise on
    // every sold-out line.
    expect(container.textContent).not.toContain("×0");
  });
});
