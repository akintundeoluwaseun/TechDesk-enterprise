// Free-tier PDF trial: three receipts, on the house.
//
// Saving a receipt as a PDF (receiptPdf) is a paid capability -- Business and
// up -- but a free shop that has never seen what a saved PDF even looks like
// has no way to judge whether it is worth paying for. Three free saves,
// lifetime, on this device, are the whole pitch: enough to try it on a real
// sale, never enough to run a shop on for free.
//
// This is a deliberate, narrow exception to the rest of the licence system's
// rule -- see the note in LicenseContext.jsx: "NOTHING EXPIRES ANY MORE". A
// free shop's sales, repairs, and receipt PRINTING are untouched, forever;
// nothing here ever takes back a PDF already saved, and nothing here is a
// countdown on a feature the shop already had working. It is a taste of ONE
// paid capability the free tier has never had at all, offered a few times
// before it settles into its normal locked state.
export const FREE_PDF_ALLOWANCE = 3;

export function clampUsed(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.floor(num);
}

/** How many of the free saves are left, given how many have been used. */
export function remaining(used) {
  return Math.max(0, FREE_PDF_ALLOWANCE - clampUsed(used));
}
