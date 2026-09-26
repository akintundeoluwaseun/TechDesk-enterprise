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

// The exact complaint: a fixed 12pt shop name on a 58mm-wide thermal roll --
// far less room than the A4 receipts even had -- with nothing catching a
// long one.
const LONG_NAME = "Kolly Bright Dynamic Multiventures International Enterprises";

vi.mock("./layout", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fitFontSize: vi.fn(actual.fitFontSize) };
});

describe("a long shop name never runs off the 58mm thermal roll", () => {
  beforeEach(() => {
    storage.clear();
    layout.fitFontSize.mockClear();
  });

  it("shrinks the header against the roll's own printable width", async () => {
    db.saveSettings({ shopName: LONG_NAME });
    const { buildThermalReceiptPdf } = await import("./thermal");
    buildThermalReceiptPdf(SALE);

    const WIDTH_MM = 58;
    const MARGIN_MM = 3;
    expect(layout.fitFontSize).toHaveBeenCalledWith(
      expect.anything(),
      LONG_NAME.toUpperCase(),
      WIDTH_MM - MARGIN_MM * 2,
      expect.objectContaining({ max: 12 })
    );
  });

  it("still generates a normal receipt for a short shop name", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildThermalReceiptPdf } = await import("./thermal");
    expect(() => buildThermalReceiptPdf(SALE)).not.toThrow();
  });

  it("never throws when the shop name is unusually long", async () => {
    db.saveSettings({ shopName: LONG_NAME });
    const { buildThermalReceiptPdf } = await import("./thermal");
    expect(() => buildThermalReceiptPdf(SALE)).not.toThrow();
  });
});
