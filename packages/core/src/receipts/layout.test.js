import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import { fitFontSize, drawLogo, pdfLock, printedOnLine } from "./layout";

// A 2x2 PNG. Small, real, and decodable -- jsPDF reads the header.
const LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC";

describe("fitFontSize keeps text inside its budget", () => {
  it("leaves a short name at its natural size", () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const size = fitFontSize(doc, "TECHDESK", 200, { max: 22, min: 9 });
    expect(size).toBe(22);
  });

  it("shrinks a long shop name until it actually fits", () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const text = "KOLLY BRIGHT DYNAMIC MULTIVENTURES";
    const maxWidth = 250;
    const size = fitFontSize(doc, text, maxWidth, { max: 22, min: 9 });
    // A real fit was found -- the floor was not what stopped it.
    expect(size).toBeGreaterThan(9);
    expect(size).toBeLessThan(22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    // The whole point: whatever size it lands on, the text must actually be
    // within budget -- not just smaller than it started.
    expect(doc.getTextWidth(text)).toBeLessThanOrEqual(maxWidth);
  });

  it("never shrinks past the floor, even for an absurd name", () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const text = "A".repeat(200);
    const size = fitFontSize(doc, text, 50, { max: 22, min: 9 });
    expect(size).toBe(9);
  });
});

describe("drawLogo scales to fit without stretching", () => {
  it("returns 0 and draws nothing when there is no logo", () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    expect(drawLogo(doc, {}, 40, 20, 36, 28)).toBe(0);
  });

  it("returns a real height, no taller than the box, when there is one", () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const h = drawLogo(doc, { logo: LOGO }, 40, 20, 36, 28);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThanOrEqual(28);
  });

  it("survives a logo that is not a usable image", () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    expect(() => drawLogo(doc, { logo: "data:image/png;base64,not-a-png" }, 40, 20, 36, 28)).not.toThrow();
  });
});

describe("pdfLock refuses editing, without ever asking anyone for a password", () => {
  it("leaves the user password empty, so any PDF viewer opens it straight away", () => {
    expect(pdfLock().userPassword).toBe("");
  });

  it("does not grant permission to modify the document or add form fields/annotations", () => {
    const { userPermissions } = pdfLock();
    expect(userPermissions).not.toContain("modify");
    expect(userPermissions).not.toContain("annot-forms");
  });

  it("still allows printing and copying the text -- neither is editing", () => {
    const { userPermissions } = pdfLock();
    expect(userPermissions).toContain("print");
    expect(userPermissions).toContain("copy");
  });

  it("gives every document its own owner password, not one fixed value shared by all", () => {
    const a = pdfLock().ownerPassword;
    const b = pdfLock().ownerPassword;
    expect(a).not.toBe("");
    expect(a).not.toBe(b);
  });

  it("actually locks the PDF it is passed to, not just the options object", () => {
    const doc = new jsPDF({ unit: "pt", format: "a4", encryption: pdfLock() });
    doc.text("Hello", 40, 40);
    // The one thing every encrypted PDF must reference from its trailer,
    // regardless of what jsPDF names the object holding it.
    expect(doc.output()).toMatch(/\/Encrypt \d+ 0 R/);
  });
});

describe("printedOnLine says when this copy left the till", () => {
  it("starts with the word 'Printed', not the sale or repair's own date", () => {
    expect(printedOnLine()).toMatch(/^Printed /);
  });
});
