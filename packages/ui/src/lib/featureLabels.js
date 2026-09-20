// What each capability is called when a shop is being asked to pay for it.
//
// The capability names are for the code -- "receiptPdf", "multiBranch". This
// is the other half: the same thing said the way the person standing at the
// counter would say it, because the upgrade screen is where they decide, and
// a list of camelCase identifiers decides nothing.
//
// Every paid capability needs a line here. A feature with no label is one a
// shop is being charged for without being told what it is, so the upgrade
// screen leaves it out rather than showing the raw name.
export const FEATURE_LABELS = {
  receiptPdf: "Save receipts as PDF",
  receiptShare: "Send receipts on WhatsApp",
  staff: "Add staff to the counter",
  roles: "Decide what each staff member can touch",
  pin: "Lock the app with a PIN",
  hq: "Report to head office",
  lan: "Share one set of records across the shop's computers",
  multiBranch: "Run more than one branch",
  unlimitedStaff: "As many staff as you need",
};

/** The labelled features a tier adds on top of the one below it. */
export function addedBy(fromCapabilities, toCapabilities) {
  const had = new Set(fromCapabilities);
  return toCapabilities.filter((f) => !had.has(f) && FEATURE_LABELS[f]).map((f) => FEATURE_LABELS[f]);
}
