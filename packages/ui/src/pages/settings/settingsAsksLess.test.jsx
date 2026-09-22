import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../../lib/ThemeContext";
import { SettingsProvider } from "../../lib/SettingsContext";
import ShopTab from "./ShopTab";
import ReceiptsTab from "./ReceiptsTab";

// Settings asked too much, and asked it in the wrong order.
//
// The Shop tab opened on "Business type" -- something you answer once, on the
// day you install -- and put the shop's own name, logo and number underneath
// it. Eleven fields were on screen before a shop could print a receipt with
// its name on it.

function shopTab() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <SettingsProvider>
          <ShopTab />
        </SettingsProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("the Shop tab opens on the shop", () => {
  beforeEach(() => localStorage.clear());

  it("puts the shop's name, logo and number above everything else", () => {
    const { container } = shopTab();
    const text = container.textContent;

    // Read off the rendered page, not from the source: the bug was the order
    // things appear in, and only the rendered order can fail this.
    const name = text.indexOf("Shop name");
    const phone = text.indexOf("Phone");
    const type = text.indexOf("Business type");
    const appearance = text.indexOf("Appearance");

    expect(name).toBeGreaterThan(-1);
    expect(name).toBeLessThan(type);
    expect(phone).toBeLessThan(type);
    expect(type).toBeLessThan(appearance);
    expect(screen.getByLabelText(/add a shop logo/i)).toBeInTheDocument();
  });

  it("does not ask for a website, a VAT id or bank details up front", () => {
    shopTab();
    // Still available -- nothing was taken away -- just not in the way of a
    // shop that came here to type its name.
    expect(screen.queryByLabelText("Website")).toBe(null);
    expect(screen.queryByLabelText("Tax / VAT ID")).toBe(null);
    expect(screen.queryByLabelText("Account number")).toBe(null);
  });

  it("hands them over when somebody asks for them", () => {
    shopTab();
    fireEvent.click(screen.getByRole("button", { name: /email, website, vat/i }));
    expect(screen.getByLabelText("Website")).toBeInTheDocument();
    expect(screen.getByLabelText("Tax / VAT ID")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /bank details/i }));
    expect(screen.getByLabelText("Account number")).toBeInTheDocument();
  });

  it("says whether there is anything folded away, so shut is not unknown", () => {
    const { container } = shopTab();
    expect(container.textContent).toContain("most shops leave these empty");
  });
});

describe("the Receipts tab", () => {
  beforeEach(() => localStorage.clear());

  function receiptsTab() {
    return render(
      <MemoryRouter>
        <ThemeProvider>
          <SettingsProvider>
            <ReceiptsTab />
          </SettingsProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );
  }

  it("keeps the {{token}} list out of the way of the two boxes people edit", () => {
    receiptsTab();
    expect(screen.getByLabelText("Return policy")).toBeInTheDocument();
    expect(screen.getByLabelText("Receipt footer")).toBeInTheDocument();
    expect(screen.queryByLabelText("whatsapp-template")).toBe(null);

    fireEvent.click(screen.getByRole("button", { name: /whatsapp message wording/i }));
    expect(screen.getByPlaceholderText(/built-in wording/i)).toBeInTheDocument();
  });
});
