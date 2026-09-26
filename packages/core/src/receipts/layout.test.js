import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import { fitFontSize, drawLogo } from "./layout";

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
