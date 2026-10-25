import { describe, it, expect, beforeEach, vi } from "vitest";
import { storage } from "../storage";
import { db } from "../db";
import { builtByLine } from "./layout";
import { BUILDER_LINE, builderLabel } from "@techdesk/editions";

// The line of credit at the foot of a receipt.
//
// It is the one of the three places it appears that leaves the building --
// the sign-in screen and Settings stay with the shop; this goes home in a
// customer's hand. So it is worth proving it reaches the paper, and that it
// says the same thing the other two say rather than a second spelling of the
// name that has quietly drifted.
//
// Asserted against the finished PDF rather than by watching the generator
// draw: what is in the file is what prints, and that holds however the
// drawing is rearranged later.

const SALE = {
  id: "s1",
  invoice: "INV-00001",
  createdAt: new Date().toISOString(),
  customerName: "Bright Tech Hub",
  customerPhone: "08030000001",
  items: [{ name: "HP EliteBook 840", qty: 2, price: 250000, imeis: ["SN-AAA111", "SN-BBB222"] }],
  subtotal: 500000,
  total: 500000,
  amountPaid: 500000,
  paymentStatus: "Paid",
};

// A finished receipt is encrypted (pdfLock), so its text cannot be read back
// out of the bytes. Unlocked here -- and ONLY here -- so the assertion can be
// about what is actually on the page rather than about which function the
// generator happened to call. Everything else in layout stays real.
vi.mock("./layout", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, pdfLock: () => {} };
});

/** The readable text of a finished document. */
function pdfText(doc) {
  // jsPDF writes uncompressed content streams here, so the drawn strings sit
  // in the output as literals. Strip the PDF's own escaping so a line broken
  // across draw calls still matches.
  return doc.output("arraybuffer")
    ? Buffer.from(doc.output("arraybuffer")).toString("latin1")
    : "";
}

describe("a receipt carries the line of credit", () => {
  beforeEach(() => {
    storage.clear();
    db.saveSettings({ shopName: "Bright Tech Hub" });
  });

  it("says the same thing the app says, from one place", () => {
    expect(builtByLine()).toContain(BUILDER_LINE);
    expect(builtByLine()).toContain(builderLabel());
  });

  it("gives an address that can be read off paper", () => {
    // It cannot be clicked on a printed receipt, so somebody has to type it:
    // no scheme to copy out, and no query string to wonder about.
    expect(builderLabel()).not.toMatch(/^https?:/);
    expect(builderLabel()).not.toContain("?");
  });

  it("reaches the A4 invoice", async () => {
    const { buildInvoicePdf } = await import("./invoice");
    const text = pdfText(buildInvoicePdf(SALE));
    expect(text).toContain(BUILDER_LINE);
    expect(text).toContain(builderLabel());
  });

  it("reaches the 58mm receipt", async () => {
    const { buildThermalReceiptPdf } = await import("./thermal");
    const text = pdfText(buildThermalReceiptPdf(SALE));
    // 58mm of paper is narrow enough that the name and the address are split
    // across lines, so the joined string will not appear in one piece --
    // both halves reaching the roll is what matters.
    expect(text).toContain(BUILDER_LINE);
    expect(text.replace(/[^\x20-\x7e]/g, "")).toContain(builderLabel());
  });
});
