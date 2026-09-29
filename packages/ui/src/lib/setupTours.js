// Short, one-off tours that turn up at the moment they're needed, rather
// than all at once on the first day:
//
//   sale-setup     the first sale, when the shop has no name or no signature
//                  on its receipts yet -- takes them to Settings to add just
//                  what's missing (the name, the signature, or both)
//   repair-ticket  the first repair, when no ticket has ever been downloaded
//                  -- says why a printed ticket matters, then points at it
//
// Same doorbell shape as upgradeModal.js: a page rings, the shell (which
// owns routing and the tour overlay) answers.
import { db } from "./db";

const KEY_SALE_SETUP = "techdesk_tour_sale_setup_done";
const KEY_TICKET = "techdesk_ticket_downloaded";
const DEFAULT_SHOP_NAME = "TechDesk"; // core's placeholder until a shop types its own

const listeners = new Set();

export function requestTour(kind, options = {}) {
  for (const fn of listeners) {
    try { fn(kind, options); } catch { /* keep ringing */ }
  }
}

export function onTourRequest(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function flag(key) {
  try { return localStorage.getItem(key) === "1"; } catch { return true; }
}
function setFlag(key) {
  try { localStorage.setItem(key, "1"); } catch { /* private mode: it just asks again */ }
}

/** What the receipts are still missing: the shop's name, its signature, or neither. */
export function shopSetupNeeds(settings = db.getSettings()) {
  const name = String(settings?.shopName || "").trim();
  return {
    name: !name || name === DEFAULT_SHOP_NAME,
    signature: !settings?.ownerSignature,
  };
}

/**
 * Should starting a sale show the setup tour instead? Once only: a shop that
 * finishes it or waves it away is not asked again on every sale.
 */
export function wantsSaleSetup(settings) {
  if (flag(KEY_SALE_SETUP)) return false;
  const need = shopSetupNeeds(settings);
  return need.name || need.signature;
}

export function markSaleSetupDone() {
  setFlag(KEY_SALE_SETUP);
}

export function ticketDownloaded() {
  return flag(KEY_TICKET);
}

/** Called whenever a repair ticket is saved or printed. */
export function markTicketDownloaded() {
  setFlag(KEY_TICKET);
}
