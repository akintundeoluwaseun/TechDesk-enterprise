// Delivering the repair ticket and the blank intake form.
import { buildRepairTicketPdf, buildBlankRepairFormPdf, receiptFilename } from "@techdesk/core";
import { savePdf, printPdf } from "./saveFile";

export function generateRepairTicketPdf(repair, { autoOpen = true, print = false } = {}) {
  const doc = buildRepairTicketPdf(repair);
  if (autoOpen) {
    const filename = receiptFilename(repair.customerName, repair.ticket);
    if (print) printPdf(doc, filename);
    else savePdf(doc, filename);
  }
  return doc;
}

export function generateBlankRepairFormPdf({ autoOpen = true } = {}) {
  const doc = buildBlankRepairFormPdf();
  if (autoOpen) savePdf(doc, "repair-ticket-form.pdf");
  return doc;
}
