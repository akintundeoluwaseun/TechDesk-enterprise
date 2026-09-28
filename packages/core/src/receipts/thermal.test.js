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
  return { ...actual, fitFontSize: vi.fn(actual.fitFontSize), printedOnLine: vi.fn(actual.printedOnLine) };
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

// A 2x2 PNG. Small, real, and decodable -- jsPDF reads the header.
const LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC";

/** jsPDF writes an image as a PDF XObject; no image, no such object. */
const hasImage = (doc) => /\/Subtype\s*\/Image/.test(doc.output());

describe("a captured customer signature prints on the 58mm receipt", () => {
  beforeEach(() => storage.clear());

  it("draws the signature when one was captured", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildThermalReceiptPdf } = await import("./thermal");
    expect(hasImage(buildThermalReceiptPdf({ ...SALE, signature: LOGO }))).toBe(true);
  });

  it("still just prints the blank line when there is no signature", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildThermalReceiptPdf } = await import("./thermal");
    expect(hasImage(buildThermalReceiptPdf(SALE))).toBe(false);
  });

  it("survives a signature that is not a usable image", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildThermalReceiptPdf } = await import("./thermal");
    expect(() =>
      buildThermalReceiptPdf({ ...SALE, signature: "data:image/png;base64,not-really-a-png" })
    ).not.toThrow();
  });
});

describe("the shop's own authorized signature, saved once in Settings", () => {
  beforeEach(() => storage.clear());

  it("prints on every 58mm receipt without the customer signing anything", async () => {
    db.saveSettings({ shopName: "TechDesk", ownerSignature: LOGO });
    const { buildThermalReceiptPdf } = await import("./thermal");
    expect(hasImage(buildThermalReceiptPdf(SALE))).toBe(true);
  });

  it("and the customer's own signature still prints alongside it", async () => {
    db.saveSettings({ shopName: "TechDesk", ownerSignature: LOGO });
    const { buildThermalReceiptPdf } = await import("./thermal");
    const doc = buildThermalReceiptPdf({ ...SALE, signature: LOGO });
    expect(doc.output().match(/\/Subtype\s*\/Image/g)?.length).toBe(2);
  });

  it("survives an owner signature that is not a usable image", async () => {
    db.saveSettings({ shopName: "TechDesk", ownerSignature: "data:image/png;base64,not-really-a-png" });
    const { buildThermalReceiptPdf } = await import("./thermal");
    expect(() => buildThermalReceiptPdf(SALE)).not.toThrow();
  });
});

describe("the 58mm receipt cannot be edited once it's generated", () => {
  beforeEach(() => storage.clear());

  it("is locked with encryption, not left a plain editable PDF", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildThermalReceiptPdf } = await import("./thermal");
    expect(buildThermalReceiptPdf(SALE).output()).toMatch(/\/Encrypt \d+ 0 R/);
  });
});

describe("the receipt says when this copy was printed", () => {
  beforeEach(() => {
    storage.clear();
    layout.printedOnLine.mockClear();
  });

  it("stamps a printed-on line, separate from the sale's own date", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildThermalReceiptPdf } = await import("./thermal");
    buildThermalReceiptPdf(SALE);
    expect(layout.printedOnLine).toHaveBeenCalled();
  });
});

describe("a long customer name never runs off the 58mm roll's edge", () => {
  beforeEach(() => storage.clear());

  // The exact complaint, reproduced: on a 52mm-wide printable area, even the
  // floor font size still doesn't fit this name on one line -- it used to
  // print straight over the "Name" label to its left. Wrapping the value
  // onto its own line, under the label, is what actually stops that, and it
  // needs the roll itself to grow to hold the extra lines.
  const LONG_CUSTOMER = "Kolly Bright Dynamic Multiventures International Enterprises Limited";

  it("grows the roll's own length to fit a wrapped long name instead of overlapping the label", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildThermalReceiptPdf } = await import("./thermal");

    const shortDoc = buildThermalReceiptPdf({ ...SALE, customerName: "Ade" });
    const longDoc = buildThermalReceiptPdf({ ...SALE, customerName: LONG_CUSTOMER });

    expect(longDoc.internal.pageSize.getHeight()).toBeGreaterThan(shortDoc.internal.pageSize.getHeight());
  });

  it("never throws for an unusually long customer name, email or address", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildThermalReceiptPdf } = await import("./thermal");
    expect(() =>
      buildThermalReceiptPdf({
        ...SALE,
        customerName: LONG_CUSTOMER,
        customerEmail: "a.very.long.email.address.indeed@some-long-company-domain.example.com",
        customerAddress: "123, A Very Long Street Name That Keeps Going, Somewhere Estate, Lagos",
      })
    ).not.toThrow();
  });
});
