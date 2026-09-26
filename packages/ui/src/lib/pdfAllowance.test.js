import { describe, it, expect } from "vitest";
import { FREE_PDF_ALLOWANCE, clampUsed, remaining } from "./pdfAllowance";

describe("the free-tier PDF trial", () => {
  it("starts with the full allowance", () => {
    expect(remaining(0)).toBe(FREE_PDF_ALLOWANCE);
  });

  it("drops by one for each one used", () => {
    expect(remaining(1)).toBe(FREE_PDF_ALLOWANCE - 1);
    expect(remaining(2)).toBe(FREE_PDF_ALLOWANCE - 2);
  });

  it("never goes below zero, however far past the allowance it is asked about", () => {
    expect(remaining(FREE_PDF_ALLOWANCE)).toBe(0);
    expect(remaining(FREE_PDF_ALLOWANCE + 50)).toBe(0);
  });

  it("treats junk as nothing used yet, rather than throwing or going negative", () => {
    expect(clampUsed(-4)).toBe(0);
    expect(clampUsed(NaN)).toBe(0);
    expect(clampUsed(undefined)).toBe(0);
    expect(clampUsed("not a number")).toBe(0);
    expect(remaining(-4)).toBe(FREE_PDF_ALLOWANCE);
  });

  it("only ever counts whole PDFs", () => {
    expect(clampUsed(1.9)).toBe(1);
  });
});
