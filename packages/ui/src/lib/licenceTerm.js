// How long what a shop bought lasts.
//
// Plans are yearly from YEARLY_FROM on. Before that, a code bought its tier
// for good -- and those shops keep exactly that: an unlock recorded before
// the switch is never counted down.
//
// After it, a code proves WHICH device paid and for what; the licence the
// server keeps for that PIN says UNTIL WHEN. Both have to agree for a paid
// tier to be on: the code alone would be a lifetime purchase again, and the
// licence alone could be claimed by anyone who read another shop's PIN.
//
// The licence is cached on the device with its end date, so a shop that is
// offline on the day it runs out still drops back -- and a shop that is
// offline the day it pays still gets GRACE_DAYS before the check has to land.
import { isTier, isUpgrade } from "@techdesk/editions";
import { FREE_TIER } from "./tier";

export const YEARLY_FROM = Date.parse("2026-09-30T00:00:00Z");
export const GRACE_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

function higher(a, b) {
  return isUpgrade(a, b) ? b : a;
}

/** Is a cached licence still running? Worked out from its date, not trusted from a flag. */
export function licenceActive(licence, now = Date.now()) {
  if (!licence?.found || !licence.expiresAt) return false;
  const end = Date.parse(licence.expiresAt);
  return Number.isFinite(end) && end > now;
}

/**
 * The tier this device actually gets today.
 *
 *   bought   the best tier its codes prove (LicenseContext's own reckoning,
 *            including the old activation flag's Business floor)
 *   unlocks  the history of codes accepted, each with when
 *   licence  the cached answer from licence_status: {found, tier, expiresAt, checkedAt}
 */
export function effectiveTier({ bought, unlocks = [], licence = null, now = Date.now() }) {
  const fromCodes = tierFromCodes({ bought, unlocks, licence, now });
  // A free test upgrade (payments still off): the server's trial licence is
  // the whole unlock, and it counts only while it runs. The owner switching
  // payments on ends it; codes the device holds are untouched by that.
  if (licence?.trial && isTier(licence.tier) && licenceActive(licence, now)) {
    return higher(fromCodes, licence.tier);
  }
  return fromCodes;
}

function tierFromCodes({ bought, unlocks, licence, now }) {
  if (!isTier(bought) || bought === FREE_TIER) return FREE_TIER;
  // Activated before there was any history to record -- the old flag. Those
  // shops paid for good.
  if (!unlocks.length) return bought;

  const active = licenceActive(licence, now);
  let best = FREE_TIER;

  for (const u of unlocks) {
    if (!isTier(u?.tier)) continue;
    const at = Date.parse(u.at);

    // Bought before yearly plans: theirs for good.
    if (!Number.isFinite(at) || at < YEARLY_FROM) {
      best = higher(best, u.tier);
      continue;
    }

    if (licence?.found && !licence.trial) {
      // The server has a record. It decides, up to what the code proves.
      if (active) best = higher(best, isUpgrade(licence.tier, u.tier) ? licence.tier : u.tier);
      continue;
    }

    // No record yet -- never asked, offline, or the server not caught up.
    // A fresh purchase gets a fortnight to be confirmed.
    if (now - at < GRACE_DAYS * DAY) best = higher(best, u.tier);
  }

  // Never more than the codes prove.
  return isUpgrade(bought, best) ? bought : best;
}

/** Days until the licence runs out, or null when there isn't one running. */
export function daysLeft(licence, now = Date.now()) {
  if (!licenceActive(licence, now)) return null;
  return Math.max(0, Math.ceil((Date.parse(licence.expiresAt) - now) / DAY));
}
