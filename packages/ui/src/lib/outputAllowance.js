// What a free shop can print and save each month.
//
//   Printing   10 a month, every page stamped "TechDesk".
//   Saving     3 receipts a month as a clean PDF, no stamp.
//
// Both reset on the first of the month, on this device's calendar. A paid
// shop never touches any of this. Not a lock that stands up to someone
// determined -- it lives in localStorage like the rest of the licence flag
// (see tier.js) -- it is what a free shop experiences, and what makes the
// upgrade worth having.
import { useEffect, useState } from "react";
import { can } from "./tier";

export const FREE_PRINTS_PER_MONTH = 10;
export const FREE_PDFS_PER_MONTH = 3;

const KEY = "techdesk_free_outputs";
const listeners = new Set();

export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function clamp(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** This month's counts. A new month reads as zero without anything written. */
export function usage(now = new Date()) {
  const month = monthKey(now);
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && raw.month === month) return { month, prints: clamp(raw.prints), pdfs: clamp(raw.pdfs) };
  } catch {
    // Unreadable: start the month fresh rather than locking a shop out.
  }
  return { month, prints: 0, pdfs: 0 };
}

function save(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Blocked storage: the count just doesn't stick, which only ever helps the shop.
  }
  for (const fn of listeners) {
    try { fn(next); } catch { /* keep notifying the rest */ }
  }
}

export function printsLeft(now) {
  return Math.max(0, FREE_PRINTS_PER_MONTH - usage(now).prints);
}

export function pdfsLeft(now) {
  return Math.max(0, FREE_PDFS_PER_MONTH - usage(now).pdfs);
}

export function recordPrint(now) {
  const u = usage(now);
  save({ ...u, prints: u.prints + 1 });
}

export function recordPdf(now) {
  const u = usage(now);
  save({ ...u, pdfs: u.pdfs + 1 });
}

/** Does this shop's printing carry the watermark and the monthly cap? */
export function isFreePrinting() {
  // receiptPdf is the first paid capability; any tier that has it prints clean.
  return !can("receiptPdf");
}

export function onUsageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-renders when a print or save is used, or the month turns over. */
export function useOutputAllowance() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const off = onUsageChange(() => setTick((n) => n + 1));
    const month = setInterval(() => setTick((n) => n + 1), 60 * 60 * 1000);
    return () => {
      off();
      clearInterval(month);
    };
  }, []);
  return { printsLeft: printsLeft(), pdfsLeft: pdfsLeft() };
}
