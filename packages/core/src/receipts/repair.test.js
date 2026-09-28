import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { buildRepairTicketPdf, buildBlankRepairFormPdf } from "./repair";

// A 2x2 PNG. Small, real, and decodable -- jsPDF reads the header.
const LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC";

const REPAIR = {
  id: "r1",
  ticket: "TCK-00001",
  createdAt: new Date().toISOString(),
  customerName: "Oluwaseun",
  customerPhone: "07066469118",
  device: "iPhone 11",
  problem: "Cracked screen",
  charges: [],
  parts: [],
};

/** jsPDF writes an image as a PDF XObject; no image, no such object. */
const hasImage = (doc) => /\/Subtype\s*\/Image/.test(doc.output());

describe("a long shop name never prints on top of a repair document's title", () => {
  beforeEach(() => storage.clear());

  // The exact name from a real, photographed repair ticket where it did:
  // printed directly over "REPAIR TICKET" on every copy the shop handed out.
  const LONG_NAME = "Kolly Bright Dynamic Multiventures";

  it("still generates a repair ticket for a long name, logo and all", () => {
    db.saveSettings({ shopName: LONG_NAME, logo: LOGO });
    const doc = buildRepairTicketPdf(REPAIR);
    expect(hasImage(doc)).toBe(true);
  });

  it("still generates the blank repair form for a long name, logo and all", () => {
    db.saveSettings({ shopName: LONG_NAME, logo: LOGO });
    expect(() => buildBlankRepairFormPdf()).not.toThrow();
    expect(hasImage(buildBlankRepairFormPdf())).toBe(true);
  });

  it("draws nothing at all when no logo is set", () => {
    // The old build drew an empty rectangle here, which read on every
    // ticket as a picture that had failed to load.
    db.saveSettings({ shopName: LONG_NAME });
    expect(hasImage(buildRepairTicketPdf(REPAIR))).toBe(false);
  });

  it("survives a logo that is not a usable image", () => {
    db.saveSettings({ shopName: LONG_NAME, logo: "data:image/png;base64,not-really-a-png" });
    expect(() => buildRepairTicketPdf(REPAIR)).not.toThrow();
  });
});

describe("a captured customer signature prints on the ticket", () => {
  beforeEach(() => storage.clear());

  it("draws the signature when one was captured", () => {
    db.saveSettings({ shopName: "TechDesk" });
    const doc = buildRepairTicketPdf({ ...REPAIR, signature: LOGO });
    expect(hasImage(doc)).toBe(true);
  });

  it("still just prints the blank line when there is no signature", () => {
    db.saveSettings({ shopName: "TechDesk" });
    expect(hasImage(buildRepairTicketPdf(REPAIR))).toBe(false);
  });

  it("survives a signature that is not a usable image", () => {
    db.saveSettings({ shopName: "TechDesk" });
    expect(() =>
      buildRepairTicketPdf({ ...REPAIR, signature: "data:image/png;base64,not-really-a-png" })
    ).not.toThrow();
  });
});

describe("the shop's own authorized signature, saved once in Settings", () => {
  beforeEach(() => storage.clear());

  it("prints in the RECEIVED BY box without the customer ever signing anything", () => {
    db.saveSettings({ shopName: "TechDesk", ownerSignature: LOGO });
    expect(hasImage(buildRepairTicketPdf(REPAIR))).toBe(true);
  });

  it("and the customer's own signature still prints alongside it", () => {
    db.saveSettings({ shopName: "TechDesk", ownerSignature: LOGO });
    const doc = buildRepairTicketPdf({ ...REPAIR, signature: LOGO });
    // Both are images on the same page -- two XObjects, not one.
    expect(doc.output().match(/\/Subtype\s*\/Image/g)?.length).toBe(2);
  });

  it("survives an owner signature that is not a usable image", () => {
    db.saveSettings({ shopName: "TechDesk", ownerSignature: "data:image/png;base64,not-really-a-png" });
    expect(() => buildRepairTicketPdf(REPAIR)).not.toThrow();
  });
});

describe("neither the repair ticket nor the blank form can be edited once generated", () => {
  beforeEach(() => storage.clear());

  it("locks the repair ticket with encryption, not a plain editable PDF", () => {
    db.saveSettings({ shopName: "TechDesk" });
    expect(buildRepairTicketPdf(REPAIR).output()).toMatch(/\/Encrypt \d+ 0 R/);
  });

  it("locks the blank intake form the same way", () => {
    db.saveSettings({ shopName: "TechDesk" });
    expect(buildBlankRepairFormPdf().output()).toMatch(/\/Encrypt \d+ 0 R/);
  });
});
