import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../lib/ThemeContext";
import { LicenseProvider } from "../lib/LicenseContext";
import { setCurrentTier, FREE_TIER } from "../lib/tier";
import { onOpenUpgrade } from "../lib/upgradeModal";
import { FREE_PDF_ALLOWANCE } from "../lib/pdfAllowance";
import PdfSaveButton from "./PdfSaveButton";
import { usage } from "../lib/outputAllowance";

function show(ui) {
  return render(
    <ThemeProvider>
      <LicenseProvider>{ui}</LicenseProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  setCurrentTier(FREE_TIER);
});

describe("PdfSaveButton", () => {
  it("works normally, uncounted, once the shop has actually paid for it", async () => {
    // Set through localStorage, the way a real activation does -- not by
    // calling setCurrentTier directly, which LicenseProvider's own mount
    // effect would immediately overwrite from ITS OWN idea of the tier.
    localStorage.setItem("techdesk_tier", "business");
    let saved = 0;
    const user = userEvent.setup();
    show(
      <PdfSaveButton title="Save A4" onSave={() => { saved += 1; }}>
        Save A4
      </PdfSaveButton>
    );
    for (let i = 0; i < 5; i++) {
      await user.click(screen.getByRole("button", { name: /save a4/i }));
    }
    // A paid shop is never counted or locked -- this alone would fail if the
    // trial machinery leaked into the paid path.
    expect(saved).toBe(5);
  });

  it(`lets a free shop save its first ${FREE_PDF_ALLOWANCE}, calling onSave each time`, async () => {
    let saved = 0;
    const user = userEvent.setup();
    show(
      <PdfSaveButton title="Save A4" onSave={() => { saved += 1; }}>
        Save A4
      </PdfSaveButton>
    );
    for (let i = 0; i < FREE_PDF_ALLOWANCE; i++) {
      await user.click(screen.getByRole("button", { name: /save a4/i }));
    }
    expect(saved).toBe(FREE_PDF_ALLOWANCE);
  });

  it("locks after the allowance is spent, on the free tier, like any other paid control", async () => {
    let saved = 0;
    let opened = 0;
    const stop = onOpenUpgrade(() => { opened += 1; });
    const user = userEvent.setup();
    show(
      <PdfSaveButton title="Save A4" onSave={() => { saved += 1; }}>
        Save A4
      </PdfSaveButton>
    );
    for (let i = 0; i < FREE_PDF_ALLOWANCE + 1; i++) {
      await user.click(screen.getByRole("button"));
    }
    stop();
    expect(saved).toBe(FREE_PDF_ALLOWANCE);
    expect(opened).toBe(1);
  });

  it("shows how many free saves are left", () => {
    show(
      <PdfSaveButton title="Save A4" onSave={() => {}}>
        Save A4
      </PdfSaveButton>
    );
    expect(screen.getByRole("button").textContent).toMatch(String(FREE_PDF_ALLOWANCE));
  });

  it("counts this month's saves, and a new month starts again at three", async () => {
    const user = userEvent.setup();
    show(
      <PdfSaveButton title="Save A4" onSave={() => {}}>
        Save A4
      </PdfSaveButton>
    );
    await user.click(screen.getByRole("button", { name: /save a4/i }));
    expect(usage().pdfs).toBe(1);
    // Last month's count does not carry over.
    localStorage.setItem("techdesk_free_outputs", JSON.stringify({ month: "1999-01", prints: 9, pdfs: 3 }));
    expect(usage()).toMatchObject({ prints: 0, pdfs: 0 });
  });
});
