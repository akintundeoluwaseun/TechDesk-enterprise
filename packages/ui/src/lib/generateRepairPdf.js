// Delivering the repair ticket and the blank intake form.
//
// Both are papers a shop prints to hand over or pin to a device, so on the
// free plan saving one counts as a print: stamped "TechDesk", and one of the
// month's ten. printPdf applies the same rule on its own.
import { buildRepairTicketPdf, buildBlankRepairFormPdf, receiptFilename } from "@techdesk/core";
import { savePdf, printPdf, freePrintGate } from "./saveFile";

export function generateRepairTicketPdf(repair, { autoOpen = true, print = false } = {}) {
  const doc = buildRepairTicketPdf(repair);
  if (autoOpen) {
    const filename = receiptFilename(repair.customerName, repair.ticket);
    if (print) printPdf(doc, filename);
    else if (freePrintGate(doc)) savePdf(doc, filename);
  }
  return doc;
}

export function generateBlankRepairFormPdf({ autoOpen = true } = {}) {
  const doc = buildBlankRepairFormPdf();
  if (autoOpen && freePrintGate(doc)) savePdf(doc, "repair-ticket-form.pdf");
  return doc;
}
