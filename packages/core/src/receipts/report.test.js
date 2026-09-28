import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import * as layout from "./layout";

const REPORT = {
  revenue: 50000,
  cost: 30000,
  profit: 20000,
  outstanding: 5000,
  salesCount: 4,
  repairsCount: 2,
  completed: 1,
  discount: 0,
  topProducts: [],
  paymentMethods: [],
  repairStatus: [],
  staffPerformance: [],
};

// The exact complaint: a fixed 20pt "<shop name> - Report" header used to
// keep going straight past the page margins instead of shrinking to fit --
// the same class of bug already fixed on the sales receipt and repair ticket.
const LONG_NAME = "Kolly Bright Dynamic Multiventures International Enterprises";

vi.mock("./layout", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fitFontSize: vi.fn(actual.fitFontSize) };
});

describe("a long shop name never runs off the report's page", () => {
  beforeEach(() => {
    storage.clear();
    layout.fitFontSize.mockClear();
  });

  it("shrinks the title against the printable width, not the whole page", async () => {
    db.saveSettings({ shopName: LONG_NAME });
    const { buildReportPdf } = await import("./report");
    const doc = buildReportPdf(REPORT, "today");
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 40;

    expect(layout.fitFontSize).toHaveBeenCalledWith(
      expect.anything(),
      `${LONG_NAME} - Report`,
      pageW - marginX * 2,
      expect.objectContaining({ max: 20 })
    );
  });

  it("still generates a normal report for a short shop name", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildReportPdf } = await import("./report");
    expect(() => buildReportPdf(REPORT, "today")).not.toThrow();
  });

  it("never throws when the shop name is unusually long", async () => {
    db.saveSettings({ shopName: LONG_NAME });
    const { buildReportPdf } = await import("./report");
    expect(() => buildReportPdf(REPORT, "today")).not.toThrow();
  });
});

describe("the report cannot be edited once it's generated", () => {
  beforeEach(() => storage.clear());

  it("is locked with encryption, not left a plain editable PDF", async () => {
    db.saveSettings({ shopName: "TechDesk" });
    const { buildReportPdf } = await import("./report");
    expect(buildReportPdf(REPORT, "today").output()).toMatch(/\/Encrypt \d+ 0 R/);
  });
});
