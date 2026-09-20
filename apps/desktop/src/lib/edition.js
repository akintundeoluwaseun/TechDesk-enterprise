// Which edition this build is, and what it may do.
//
// Every one of these is replaced by a literal at build time -- see the
// `define` in vite.config.js. There is nothing here to read from storage and
// nothing to set, because an edition a running app can change is an edition
// a customer can change.
//
// Two ways to ask, and the difference matters:
//
//   can("hq")     readable, for a decision the UI makes -- show a tab or not.
//   __CAN_HQ__    the same answer, written so the bundler can fold it and
//                 delete the import behind it. Use it where the code itself
//                 should not ship, not merely be hidden.
//
// Both come from one list, packages/editions/src/capabilities.js, generated
// into these constants by defineFlags(), so they cannot disagree.
//
// Note what is NOT imported here: the CAPABILITIES map itself. Importing it
// would put all three tiers' feature lists into all three binaries, so a Solo
// build would carry a labelled inventory of everything Enterprise can do.
// __TECHDESK_CAPS__ is this edition's answers only.

export const EDITION = __TECHDESK_EDITION__;
export const STAFF_LIMIT = __TECHDESK_STAFF_LIMIT__;
// A single string, not a lookup of all three: a Solo binary should not
// contain the other editions' names any more than it contains their code.
export const PRODUCT_NAME = __TECHDESK_PRODUCT_NAME__;

const CAPS = __TECHDESK_CAPS__;

/** @param {string} feature */
export function can(feature) {
  return CAPS[feature] === true;
}
