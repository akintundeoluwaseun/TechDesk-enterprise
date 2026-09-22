// What each tier can do. Data, not code.
//
// ONE APP. One download, one APK. A shop installs it, uses it free forever,
// and pays to unlock more in the copy they already have -- no second download,
// no reinstall, no losing their records to an upgrade.
//
// That model decides how this file is used. An earlier version compiled the
// tier in at build time so the paid code never shipped, which is airtight and
// completely incompatible with unlocking in place: code that is not in the
// binary cannot be switched on. So everything ships, and the tier is a
// licence the app reads at runtime.
//
// WHAT THAT COSTS, PLAINLY. A flag on the customer's own machine can be
// flipped by someone determined enough. The features that matter are not
// defended by this file at all -- they are defended by the server, which
// refuses to sync or connect a branch whose licence is not paid. Everything
// below is the shop's experience of what it bought, not a lock.

/**
 * Every capability the product has. A feature not in here cannot be gated,
 * which is deliberate: adding one should mean deciding which tiers get it.
 */
export const FEATURES = [
  // The shop itself. Free, forever, for one person.
  "sales",
  "repairs",
  "inventory",
  "customers",
  "reports",
  "receiptPrint",
  "notifications",
  "activityLog",
  "search",
  "backup",

  // Receipts that leave the counter. The free tier prints -- a shop that
  // cannot hand a customer anything is not a shop -- but saving the file and
  // sending it are what you pay for.
  "receiptPdf",
  "receiptShare",

  // More than one person behind the counter.
  "staff",
  "roles",
  "pin",

  // Two people working off each other's records.
  //
  // Each puts their number in, one types the other's, and they are linked.
  // Each side then ticks what IT sends over THAT link -- stock, repairs,
  // customers -- and whoever can see a record can work on it, not just read
  // it. Link three people in a row and it flows along the row.
  //
  // Not head office, and not sharing. Those are "hq" below.
  "syncData",

  // Head office. One shop reporting up to an account that watches several.
  "hq",

  // More than one shop.
  "lan",
  "multiBranch",
  "unlimitedStaff",
];

// Free. The whole shop, one person, receipts on paper.
const FREE = [
  "sales", "repairs", "inventory", "customers", "reports",
  "receiptPrint", "notifications", "activityLog", "search", "backup",
];

// Paid. Staff behind the counter, receipts that leave it, and two people
// working off each other's records.
//
// NOT head office. A shop on Business syncs sideways -- one device to
// another, by phone number -- and that is the whole of it. Reporting up to an
// account that watches several shops is what the tier above is for, and a
// shop that only ever has one counter should not be paying for it.
const BUSINESS = [...FREE, "receiptPdf", "receiptShare", "staff", "roles", "pin", "syncData"];

// Paid. More than one shop, and the head office that watches them.
const ENTERPRISE = [...BUSINESS, "hq", "lan", "multiBranch", "unlimitedStaff"];

export const CAPABILITIES = {
  free: FREE,
  business: BUSINESS,
  enterprise: ENTERPRISE,
};

export const TIERS = Object.keys(CAPABILITIES);

// Kept as the old name too: a great deal of call-site code and several tests
// say "edition", and renaming every one of them is churn without a reader.
export const EDITIONS = TIERS;

export const TIER_META = {
  free: {
    label: "TechDesk",
    // What the upgrade prompts offer. A locked feature says which tier opens
    // it, so "Upgrade" is never a question the shop has to go and research.
    upgradeTo: "business",
    staffLimit: 1,
  },
  business: {
    label: "TechDesk Business",
    upgradeTo: "enterprise",
    staffLimit: 3,
  },
  enterprise: {
    label: "TechDesk Enterprise",
    upgradeTo: null,
    staffLimit: Infinity,
  },
};

// The old name, for the same reason as EDITIONS.
export const EDITION_META = TIER_META;

export function isTier(tier) {
  return Object.prototype.hasOwnProperty.call(CAPABILITIES, tier);
}

export const isEdition = isTier;

export function capabilitiesOf(tier) {
  if (!isTier(tier)) {
    // Never guess. Falling back to enterprise gives the product away;
    // falling back to free takes away what a shop paid for, in the middle of
    // their day, with no explanation they could act on.
    throw new Error(
      `Unknown tier "${tier}". Expected one of: ${TIERS.join(", ")}.`
    );
  }
  return CAPABILITIES[tier];
}

/**
 * Does this tier include this feature?
 *
 * The one question call sites ask. Never `tier === "enterprise"`: "what may
 * this shop do" and "what did they buy" are different questions, and
 * conflating them is how a feature ends up half-moved between tiers.
 */
export function tierCan(tier, feature) {
  return capabilitiesOf(tier).includes(feature);
}

/**
 * The cheapest tier that includes this feature, so a locked control can say
 * which one opens it rather than just refusing.
 */
export function tierFor(feature) {
  return TIERS.find((t) => CAPABILITIES[t].includes(feature)) || null;
}

/**
 * Where a tier sits on the ladder. Higher is strictly more: every tier
 * includes everything below it, which is what makes an upgrade a one-way
 * move rather than a swap.
 *
 * The order comes from CAPABILITIES itself -- free, then business, then
 * enterprise -- so a tier added to that map lands on the ladder too, in the
 * position it was written in.
 */
export function tierRank(tier) {
  return TIERS.indexOf(tier);
}

/**
 * Would moving from `current` to `candidate` give the shop more?
 *
 * The question every activation asks. An unknown tier ranks -1 and therefore
 * never wins, and a code for the tier they already hold is not an upgrade --
 * it is a no-op, which is different from an error and must be said
 * differently.
 */
export function isUpgrade(current, candidate) {
  const to = tierRank(candidate);
  return to > -1 && to > tierRank(current);
}

export function staffLimit(tier) {
  return TIER_META[isTier(tier) ? tier : "free"].staffLimit;
}
