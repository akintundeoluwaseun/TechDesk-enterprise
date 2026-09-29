import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SalesPage from "./SalesPage";
import RepairsPage from "./RepairsPage";
import { ThemeProvider } from "../lib/ThemeContext";
import { AuthProvider } from "../lib/AuthContext";
import { SettingsProvider } from "../lib/SettingsContext";
import { LicenseProvider } from "../lib/LicenseContext";
import { HelpProvider } from "../lib/HelpContext";

// Sales and Repairs used to print every record in one long flat list --
// fine at ten rows, a wall of identical-looking cards at two hundred, with
// nothing on the page to say where "today" ended and last month began.
// They're grouped into Today / This Week / This Month / Older now, Today
// and This Week open on arrival and the rest shut until asked for.

// A Thursday, matching summary.test.js's grouping fixture: the "now" here
// has to land on a day where "today" and "earlier this week" are actually
// different days, or the split can't be told apart.
const NOW = new Date("2026-09-24T14:00:00+01:00");
const at = (iso) => new Date(iso).toISOString();

const SALES = [
  {
    id: "s-today", invoice: "INV-1", customerName: "Today Customer",
    items: [{ name: "Screen", qty: 1, price: 5000 }], total: 5000,
    paymentStatus: "Paid", paymentMethod: "Cash", createdAt: at("2026-09-24T09:00:00+01:00"),
  },
  {
    id: "s-week", invoice: "INV-2", customerName: "This Week Customer",
    items: [{ name: "Case", qty: 1, price: 2000 }], total: 2000,
    paymentStatus: "Paid", paymentMethod: "Cash", createdAt: at("2026-09-22T09:00:00+01:00"),
  },
  {
    id: "s-month", invoice: "INV-3", customerName: "This Month Customer",
    items: [{ name: "Charger", qty: 1, price: 3000 }], total: 3000,
    paymentStatus: "Paid", paymentMethod: "Cash", createdAt: at("2026-09-05T09:00:00+01:00"),
  },
  {
    id: "s-older", invoice: "INV-4", customerName: "Older Customer",
    items: [{ name: "Battery", qty: 1, price: 4000 }], total: 4000,
    paymentStatus: "Paid", paymentMethod: "Cash", createdAt: at("2026-08-15T09:00:00+01:00"),
  },
];

const REPAIRS = [
  {
    id: "r-today", ticket: "TCK-1", status: "received", paymentStatus: "Unpaid",
    device: "iPhone 11", problem: "Cracked screen", customerName: "Today Customer",
    customerPhone: "0800", repairCost: 5000, parts: [], createdAt: at("2026-09-24T09:00:00+01:00"),
  },
  {
    id: "r-week", ticket: "TCK-2", status: "received", paymentStatus: "Unpaid",
    device: "S21", problem: "Battery", customerName: "This Week Customer",
    customerPhone: "0801", repairCost: 3000, parts: [], createdAt: at("2026-09-22T09:00:00+01:00"),
  },
  {
    id: "r-month", ticket: "TCK-3", status: "received", paymentStatus: "Unpaid",
    device: "Tecno", problem: "Charging port", customerName: "This Month Customer",
    customerPhone: "0802", repairCost: 2500, parts: [], createdAt: at("2026-09-05T09:00:00+01:00"),
  },
  {
    id: "r-older", ticket: "TCK-4", status: "delivered", paymentStatus: "Paid",
    device: "Infinix", problem: "Speaker", customerName: "Older Customer",
    customerPhone: "0803", repairCost: 1500, parts: [], createdAt: at("2026-08-15T09:00:00+01:00"),
  },
];

function showSales() {
  localStorage.setItem("techdesk_sales", JSON.stringify(SALES));
  return render(
    <MemoryRouter>
      <ThemeProvider><SettingsProvider><LicenseProvider><AuthProvider><HelpProvider>
        <SalesPage />
      </HelpProvider></AuthProvider></LicenseProvider></SettingsProvider></ThemeProvider>
    </MemoryRouter>,
  );
}

function showRepairs() {
  localStorage.setItem("techdesk_repairs", JSON.stringify(REPAIRS));
  return render(
    <MemoryRouter>
      <ThemeProvider><SettingsProvider><LicenseProvider><AuthProvider><HelpProvider>
        <RepairsPage />
      </HelpProvider></AuthProvider></LicenseProvider></SettingsProvider></ThemeProvider>
    </MemoryRouter>,
  );
}

describe("Sales and Repairs are grouped by period", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Sales: shows all four period headings with the right counts", () => {
    showSales();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("This Week")).toBeInTheDocument();
    expect(screen.getByText("This Month")).toBeInTheDocument();
    expect(screen.getByText("Older")).toBeInTheDocument();
    // Each heading's own count pill, not the sale itself.
    expect(screen.getAllByText("1").length).toBe(4);
  });

  it("Sales: Today and This Week are open on arrival, This Month and Older are not", () => {
    showSales();
    expect(screen.getByText("INV-1")).toBeInTheDocument();
    expect(screen.getByText("INV-2")).toBeInTheDocument();
    expect(screen.queryByText("INV-3")).toBe(null);
    expect(screen.queryByText("INV-4")).toBe(null);
  });

  it("Sales: clicking a shut heading opens it", () => {
    showSales();
    fireEvent.click(screen.getByText("This Month"));
    expect(screen.getByText("INV-3")).toBeInTheDocument();
    // Older wasn't touched -- opening one group doesn't open the others.
    expect(screen.queryByText("INV-4")).toBe(null);
  });

  it("Repairs: Today and This Week are open on arrival, This Month and Older are not", () => {
    showRepairs();
    expect(screen.getByText("TCK-1")).toBeInTheDocument();
    expect(screen.getByText("TCK-2")).toBeInTheDocument();
    expect(screen.queryByText("TCK-3")).toBe(null);
    expect(screen.queryByText("TCK-4")).toBe(null);
  });

  it("Repairs: clicking Older opens it without touching This Month", () => {
    showRepairs();
    fireEvent.click(screen.getByText("Older"));
    expect(screen.getByText("TCK-4")).toBeInTheDocument();
    expect(screen.queryByText("TCK-3")).toBe(null);
  });

  it("searching still finds a record in a shut group", () => {
    // Filtering has to run before grouping, or a match sitting in This
    // Month would stay invisible behind a heading nobody has opened.
    showSales();
    fireEvent.change(screen.getByPlaceholderText(/search by invoice or customer/i), {
      target: { value: "INV-3" },
    });
    expect(screen.getByText("INV-3")).toBeInTheDocument();
    expect(screen.queryByText("INV-1")).toBe(null);
  });
});
