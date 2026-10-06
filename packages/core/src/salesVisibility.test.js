import { describe, it, expect } from "vitest";
import { visibleSales, SALES_WINDOW_MS } from "./summary";

const at = (msAgo) => ({ createdAt: new Date(Date.now() - msAgo).toISOString() });
const HOUR = 60 * 60 * 1000;

// A sale carries the customer's name and number. A worker keeps a day of
// them -- enough to reprint a receipt or take a return on what they sold --
// and the rest stays with the owner.
describe("which sales a worker may look at", () => {
  it("keeps the last 24 hours and no more", () => {
    const sales = [at(1 * HOUR), at(23 * HOUR), at(25 * HOUR), at(40 * 24 * HOUR)];
    const seen = visibleSales(sales, { isAdmin: false });
    expect(seen).toHaveLength(2);
    expect(seen).toEqual([sales[0], sales[1]]);
  });

  it("shows the owner everything", () => {
    const sales = [at(1 * HOUR), at(25 * HOUR), at(40 * 24 * HOUR)];
    expect(visibleSales(sales, { isAdmin: true })).toEqual(sales);
  });

  it("is exactly 24 hours", () => {
    expect(SALES_WINDOW_MS).toBe(24 * HOUR);
    const now = Date.now();
    const edge = { createdAt: new Date(now - 24 * HOUR).toISOString() };
    const past = { createdAt: new Date(now - 24 * HOUR - 1000).toISOString() };
    expect(visibleSales([edge, past], { isAdmin: false, now })).toEqual([edge]);
  });

  it("hides a sale with no date rather than showing it to everyone", () => {
    expect(visibleSales([{ invoice: "INV-1" }], { isAdmin: false })).toEqual([]);
  });

  it("copes with nothing at all", () => {
    expect(visibleSales(undefined, { isAdmin: false })).toEqual([]);
  });
});
