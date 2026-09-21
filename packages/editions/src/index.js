// Explicit .js: this package is loadable by Node directly, which does not
// guess at extensions the way a bundler does.
export {
  FEATURES,
  CAPABILITIES,
  TIERS,
  EDITIONS,
  TIER_META,
  EDITION_META,
  isTier,
  isEdition,
  capabilitiesOf,
  tierCan,
  tierFor,
  tierRank,
  isUpgrade,
  staffLimit,
} from "./capabilities.js";

export { SITE_ORIGIN, sitePage, siteLabel } from "./site.js";
