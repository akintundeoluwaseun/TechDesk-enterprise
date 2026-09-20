// Delivering the reports PDF.
import { buildReportPdf } from "@techdesk/core";
import { savePdf } from "./saveFile";

export function generateReportPdf(report, filter, { autoOpen = true } = {}) {
  const doc = buildReportPdf(report, filter);
  if (autoOpen) savePdf(doc, `techdesk-report-${filter}.pdf`);
  return doc;
}
