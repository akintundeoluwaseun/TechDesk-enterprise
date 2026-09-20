// Delivering the A4 receipt.
//
// Core draws it and hands back the document; this decides where it goes --
// the device's PDF viewer when the shop pressed Print, the file system when
// they pressed Save. That split is why core's receipt tests need no browser.
import { buildInvoicePdf, receiptFilename } from "@techdesk/core";
import { savePdf, printPdf } from "./saveFile";

export function generateInvoicePdf(sale, { autoOpen = true, print = false } = {}) {
  const doc = buildInvoicePdf(sale);
  if (autoOpen) {
    const filename = receiptFilename(sale.customerName, sale.invoice);
    // print: straight to whatever views PDFs here, so nothing has to be
    // fished back out of Downloads to be shown to the customer.
    if (print) printPdf(doc, filename);
    else savePdf(doc, filename);
  }
  return doc;
}
