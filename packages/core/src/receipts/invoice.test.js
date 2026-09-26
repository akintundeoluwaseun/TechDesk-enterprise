import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import * as layout from "./layout";

const SALE = {
  id: "s1",
  invoice: "INV-00001",
  createdAt: new Date().toISOString(),
  customerName: "Oluwaseun",
  customerPhone: "07066469118",
  items: [{ name: "Screen Protector", qty: 1, price: 1500 }],
  subtotal: 1500,
  total: 1500,
  amountPaid: 1500,
  paymentStatus: "Paid",
};

// The exact complaint: a fixed 26pt shop name kept going straight past the
// page margins instead of shrinking or wrapping to a second line. This is
// the same class of bug layout.js's fitFontSize already fixed for the repair
// ticket -- the sales receipt's header just wasn't wired to it yet.
const LONG_NAME = "Kolly Bright Dynamic Multiventures International Enterprises";

vi.mock("./layout", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fitFontSize: vi.fn(actual.fitFontSize) };
});

describe("a long shop name never runs off the sales receipt's page", () => {
  beforeEach(() => {
    storage.clear();
    layout.fitFontSize.mockClear();
  });

  it("shrinks the header against the printable width, not the whole page", async () => {
    db.saveSettings({ shopName: LONG_NAME });
    const { buildInvoicePdf } = await import("./invoice");
    const doc = buildInvoicePdf(SALE);
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 40;

    expect(layout.fitFontSize).toHaveBeenCalledWith(
      expect.anything(),
      LONG_NAME.toUpperCase(),
      pageW - marginX * 2,
      expect.objectContaining({ max: 26 })
    );
  });

  it("still generates a normal receipt for a short shop name", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildInvoicePdf } = await import("./invoice");
    expect(() => buildInvoicePdf(SALE)).not.toThrow();
  });

  it("never throws when the shop name is unusually long", async () => {
    db.saveSettings({ shopName: LONG_NAME });
    const { buildInvoicePdf } = await import("./invoice");
    expect(() => buildInvoicePdf(SALE)).not.toThrow();
  });
});
