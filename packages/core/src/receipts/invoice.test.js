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
  return { ...actual, fitFontSize: vi.fn(actual.fitFontSize), printedOnLine: vi.fn(actual.printedOnLine) };
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

// A 2x2 PNG. Small, real, and decodable -- jsPDF reads the header.
const LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC";

/** jsPDF writes an image as a PDF XObject; no image, no such object. */
const hasImage = (doc) => /\/Subtype\s*\/Image/.test(doc.output());

describe("a captured customer signature prints on the sales receipt", () => {
  beforeEach(() => storage.clear());

  it("draws the signature when one was captured", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildInvoicePdf } = await import("./invoice");
    expect(hasImage(buildInvoicePdf({ ...SALE, signature: LOGO }))).toBe(true);
  });

  it("still just prints the blank line when there is no signature", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildInvoicePdf } = await import("./invoice");
    expect(hasImage(buildInvoicePdf(SALE))).toBe(false);
  });

  it("survives a signature that is not a usable image", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildInvoicePdf } = await import("./invoice");
    expect(() =>
      buildInvoicePdf({ ...SALE, signature: "data:image/png;base64,not-really-a-png" })
    ).not.toThrow();
  });
});

describe("the shop's own authorized signature, saved once in Settings", () => {
  beforeEach(() => storage.clear());

  it("prints on every sales receipt without the customer signing anything", async () => {
    db.saveSettings({ shopName: "TechDesk", ownerSignature: LOGO });
    const { buildInvoicePdf } = await import("./invoice");
    expect(hasImage(buildInvoicePdf(SALE))).toBe(true);
  });

  it("and the customer's own signature still prints alongside it", async () => {
    db.saveSettings({ shopName: "TechDesk", ownerSignature: LOGO });
    const { buildInvoicePdf } = await import("./invoice");
    const doc = buildInvoicePdf({ ...SALE, signature: LOGO });
    expect(doc.output().match(/\/Subtype\s*\/Image/g)?.length).toBe(2);
  });

  it("survives an owner signature that is not a usable image", async () => {
    db.saveSettings({ shopName: "TechDesk", ownerSignature: "data:image/png;base64,not-really-a-png" });
    const { buildInvoicePdf } = await import("./invoice");
    expect(() => buildInvoicePdf(SALE)).not.toThrow();
  });
});

describe("the sales receipt cannot be edited once it's generated", () => {
  beforeEach(() => storage.clear());

  it("is locked with encryption, not left a plain editable PDF", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildInvoicePdf } = await import("./invoice");
    expect(buildInvoicePdf(SALE).output()).toMatch(/\/Encrypt \d+ 0 R/);
  });
});

describe("the receipt says when this copy was printed", () => {
  beforeEach(() => {
    storage.clear();
    layout.printedOnLine.mockClear();
  });

  it("stamps a printed-on line, separate from the sale's own date", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildInvoicePdf } = await import("./invoice");
    buildInvoicePdf(SALE);
    expect(layout.printedOnLine).toHaveBeenCalled();
  });
});

describe("a long customer name never bleeds into the next column", () => {
  beforeEach(() => storage.clear());

  // The exact complaint, reproduced: at a fixed 10pt this name is wider than
  // its own column even at the smallest legible size, so shrinking alone
  // still ends with "...Enterprises" printing straight into "Email" beside
  // it. Wrapping onto a second line is what actually stops that.
  const LONG_CUSTOMER = "Kolly Bright Dynamic Multiventures International Enterprises Limited";

  it("grows the customer details box to fit a wrapped long name instead of overlapping Email/Address", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildInvoicePdf } = await import("./invoice");

    // The items table is the first autoTable on the receipt, drawn right
    // after the customer-details box. If a long name wraps onto a second
    // line and the box grows to hold it, the table starts further down the
    // page than it does for a short one -- if the box stayed a fixed height
    // instead, the two would land in the same place.
    const shortDoc = buildInvoicePdf({ ...SALE, customerName: "Ade" });
    const longDoc = buildInvoicePdf({ ...SALE, customerName: LONG_CUSTOMER });

    expect(longDoc.lastAutoTable.finalY).toBeGreaterThan(shortDoc.lastAutoTable.finalY);
  });

  it("never throws for an unusually long customer name, phone, email or address", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildInvoicePdf } = await import("./invoice");
    expect(() =>
      buildInvoicePdf({
        ...SALE,
        customerName: LONG_CUSTOMER,
        customerEmail: "a.very.long.email.address.indeed@some-long-company-domain.example.com",
        customerAddress: "123, A Very Long Street Name That Keeps Going, Somewhere Estate, Lagos",
      })
    ).not.toThrow();
  });
});
