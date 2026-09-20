// What this shop has paid for, and what that lets them do.
//
// One app, one download. A shop installs it, uses it free forever, and pays
// to unlock more in the copy they already have. So the tier is not a property
// of the build -- every build is the same build -- it is a property of the
// licence on this device, and it can change while the app is open.
//
// Read it through useTier() in a component, so the screen re-renders the
// moment an upgrade lands. currentTier() is for the few places that are not
// components; it reads the same state.
//
// WHAT THIS IS NOT. It is not a lock. It is a flag on the customer's own
// machine, and anyone determined can change it. What actually defends the
// paid features is the server: sync-push and connect-start refuse a device
// whose licence is not paid, and no amount of editing localStorage forges
// that. This file is the shop's experience of what they bought.
import { CAPABILITIES, TIER_META, isTier, tierCan, tierFor, staffLimit } from "@techdesk/editions";

export const FREE_TIER = "free";

// Written by LicenseContext when a licence is read or an upgrade is applied.
// Held here rather than in the context alone so non-component code -- the
// receipt buttons' helpers, the sync hook -- can ask without threading React
// through everything.
let current = FREE_TIER;
const listeners = new Set();

export function currentTier() {
  return current;
}

export function setCurrentTier(tier) {
  const next = isTier(tier) ? tier : FREE_TIER;
  if (next === current) return;
  current = next;
  for (const fn of listeners) {
    try {
      fn(next);
    } catch {
      // One listener throwing must not stop the rest from learning that the
      // shop just paid.
    }
  }
}

export function onTierChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Can this shop use this feature? */
export function can(feature) {
  return tierCan(current, feature);
}

/** Which tier opens it, for a locked control that should say so. */
export const unlockedBy = tierFor;

export function tierLabel(tier = current) {
  return TIER_META[isTier(tier) ? tier : FREE_TIER].label;
}

export function nextTier(tier = current) {
  return TIER_META[isTier(tier) ? tier : FREE_TIER].upgradeTo;
}

export function currentStaffLimit() {
  return staffLimit(current);
}

export { CAPABILITIES };
