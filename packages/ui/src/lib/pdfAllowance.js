// Free plan: three clean receipt PDFs a month.
//
// Saving a receipt as a PDF (receiptPdf) is a Business capability. A free
// shop gets three saves a month with no watermark -- enough to send the odd
// customer a proper receipt, and to see what Business does -- counted in
// outputAllowance.js alongside the ten stamped prints.
export { FREE_PDFS_PER_MONTH as FREE_PDF_ALLOWANCE } from "./outputAllowance";
import { FREE_PDFS_PER_MONTH } from "./outputAllowance";

export function clampUsed(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
}

/** How many of this month's free saves are left, given how many have been used. */
export function remaining(used) {
  return Math.max(0, FREE_PDFS_PER_MONTH - clampUsed(used));
}
