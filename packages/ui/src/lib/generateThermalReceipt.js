// Delivering the 58mm receipt. Core draws it; this puts it somewhere.
import { buildThermalReceiptPdf, receiptFilename } from "@techdesk/core";
import { savePdf, printPdf } from "./saveFile";

export function generateThermalReceiptPdf(sale, { autoOpen = true, print = false } = {}) {
  const doc = buildThermalReceiptPdf(sale);
  if (autoOpen) {
    const filename = receiptFilename(sale.customerName, sale.invoice, "58mm");
    if (print) printPdf(doc, filename);
    else savePdf(doc, filename);
  }
  return doc;
}
