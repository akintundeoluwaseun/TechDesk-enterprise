// What each edition can do. Data, not code.
//
// The tiers used to be three codebases. The difference between them was
// spread across 25 files and had to be inferred from a diff; a feature moved
// between tiers by editing three repositories and hoping. It is this list now,
// and the list is the only place it exists.
//
// Call sites ask can("hq"), never edition === "enterprise". The question
// "what may this build do" and the question "which build is this" are
// different, and conflating them is how a feature ends up half-moved.

/**
 * Every capability the product has. A feature not in here cannot be gated,
 * which is deliberate: adding one should mean deciding which tiers get it.
 */
export const FEATURES = [
  // The shop itself. Every edition, every platform -- a sale means the same
  // thing everywhere, which is the whole point of the merge.
  "sales",
  "repairs",
  "inventory",
  "customers",
  "reports",
  "receipts",
  "notifications",
  "activityLog",
  "search",
  "backup",

  // A shop with staff in it.
  "staff",
  "roles",
  "pin",

  // Paid.
  "activation",
  "hq",
  "lan",
  "multiBranch",
  "unlimitedStaff",
];

const SHOP = [
  "sales", "repairs", "inventory", "customers", "reports",
  "receipts", "notifications", "activityLog", "search", "backup",
];

const SOLO = [...SHOP];
const BUSINESS = [...SOLO, "staff", "roles", "pin", "activation", "hq"];
const ENTERPRISE = [...BUSINESS, "lan", "multiBranch", "unlimitedStaff"];

export const CAPABILITIES = {
  solo: SOLO,
  business: BUSINESS,
  enterprise: ENTERPRISE,
};

export const EDITIONS = Object.keys(CAPABILITIES);

// Naming, ids and version lanes, so three electron-builder configs can be one
// config that asks which edition it is building.
export const EDITION_META = {
  solo: {
    productName: "TechDesk Solo",
    appId: "com.techdesk.solo",
    versionLane: 1,
    staffLimit: 1,
  },
  business: {
    productName: "TechDesk Business",
    appId: "com.techdesk.business",
    versionLane: 2,
    staffLimit: 3,
  },
  enterprise: {
    productName: "TechDesk Enterprise",
    appId: "com.techdesk.enterprise",
    versionLane: 3,
    staffLimit: Infinity,
  },
};

export function isEdition(edition) {
  return Object.prototype.hasOwnProperty.call(CAPABILITIES, edition);
}

export function capabilitiesOf(edition) {
  if (!isEdition(edition)) {
    // Never guess. A typo in a build script that quietly produced a Solo
    // binary labelled Enterprise would be found by a customer, not by us.
    throw new Error(
      `Unknown edition "${edition}". Expected one of: ${EDITIONS.join(", ")}.`
    );
  }
  return CAPABILITIES[edition];
}

/**
 * The build-time constants for one edition, for a bundler's `define`.
 *
 * Generated from the list above rather than written out again, so the two
 * cannot disagree -- and every flag is a literal `true` or `false` in the
 * source the bundler sees, which is what lets it delete the branch and the
 * import behind it. A capability check that resolves at runtime can hide a
 * feature; only one that resolves at build time can leave it out.
 */
export function defineFlags(edition) {
  const caps = new Set(capabilitiesOf(edition));
  const limit = EDITION_META[edition].staffLimit;
  const flags = {
    __TECHDESK_EDITION__: JSON.stringify(edition),
    __TECHDESK_PRODUCT_NAME__: JSON.stringify(EDITION_META[edition].productName),
    // NOT JSON.stringify: JSON has no Infinity and turns it into the string
    // "null". That would compile Enterprise's unlimited staff to `null`, and
    // `count < null` is false -- unlimited would have become a limit of zero,
    // in the one edition sold on not having one. A bundler's define takes a
    // fragment of source, so the literal is what belongs here.
    __TECHDESK_STAFF_LIMIT__: limit === Infinity ? "Infinity" : JSON.stringify(limit),
  };
  for (const feature of FEATURES) {
    flags[`__CAN_${feature.toUpperCase()}__`] = JSON.stringify(caps.has(feature));
  }

  // This edition's answers, and no other edition's. can() is backed by this
  // rather than by importing CAPABILITIES, because importing the map would
  // put every tier's feature list into every binary -- a Solo build carrying
  // a labelled inventory of what Enterprise can do, which is both pointless
  // weight and a free map for anyone patching the bundle.
  flags.__TECHDESK_CAPS__ = JSON.stringify(
    Object.fromEntries(FEATURES.map((f) => [f, caps.has(f)]))
  );
  return flags;
}
