import { describe, it, expect, beforeEach, vi } from "vitest";
import { jsPDF } from "jspdf";
import { setCurrentTier, FREE_TIER } from "./tier";
import { onOpenUpgrade } from "./upgradeModal";
import { printsLeft, pdfsLeft, recordPdf, usage, FREE_PRINTS_PER_MONTH } from "./outputAllowance";
import { freePrintGate } from "./saveFile";

vi.mock("@techdesk/platform", () => ({ platform: () => ({ openFile: async () => ({ ok: true }) }) }));

beforeEach(() => {
  localStorage.clear();
  setCurrentTier(FREE_TIER);
});

function pageText(doc) {
  return doc.output();
}

describe("the free plan's monthly allowance", () => {
  it("starts each month with 10 prints and 3 clean PDFs", () => {
    expect(printsLeft()).toBe(10);
    expect(pdfsLeft()).toBe(3);
    recordPdf();
    expect(pdfsLeft()).toBe(2);
  });

  it("stamps every free print with TechDesk and counts it", () => {
    const doc = new jsPDF();
    expect(freePrintGate(doc)).toBe(true);
    expect(pageText(doc)).toContain("TechDesk");
    expect(usage().prints).toBe(1);
  });

  it("stops at ten and opens the upgrade screen instead", () => {
    let opened = 0;
    const stop = onOpenUpgrade(() => { opened += 1; });
    for (let i = 0; i < FREE_PRINTS_PER_MONTH; i++) expect(freePrintGate(new jsPDF())).toBe(true);
    expect(freePrintGate(new jsPDF())).toBe(false);
    stop();
    expect(opened).toBe(1);
    expect(printsLeft()).toBe(0);
  });

  it("leaves a paid shop's prints clean and uncounted", () => {
    setCurrentTier("business");
    const doc = new jsPDF();
    expect(freePrintGate(doc)).toBe(true);
    expect(pageText(doc)).not.toContain("Made with TechDesk Free");
    expect(usage().prints).toBe(0);
  });
});
