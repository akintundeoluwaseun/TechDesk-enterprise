/**
 * Serial numbers on a sale line, one per unit.
 *
 * Two of the same laptop are one line with a quantity of two, and two
 * different serials. The line used to carry a single serial, so the second
 * machine's number was never asked for and the receipt went out naming one of
 * the two devices the customer walked away with. That number is what they come
 * back with when a machine is stolen, dies inside warranty, or is brought in
 * for a swap, and a receipt naming the wrong unit is worse than one naming
 * none.
 *
 * Lives in core because a sale can be rung up two ways -- the sale screen and
 * the assistant -- and both have to agree about how many serials a line has.
 */

/**
 * Pads up and trims from the end, keeping whatever has already been typed in
 * the slots that survive: taking one laptop back off a sale of three must not
 * clear the two serials already scanned.
 */
export function serialSlots(existing, qty) {
  const have = Array.isArray(existing) ? existing : [];
  const n = Math.max(1, Number(qty) || 1);
  return Array.from({ length: n }, (_, i) => have[i] ?? "");
}

/** The slots, trimmed, as they should be stored against the line. */
export function cleanSerials(existing, qty) {
  return serialSlots(existing, qty).map((v) => String(v || "").trim());
}

/**
 * The same serials in the one field everything else already reads -- the
 * invoice column, the {{imei}} token on a receipt template, search. Stored
 * beside the list so none of those had to be touched, and so a sale saved by
 * this version still reads sensibly in an older one.
 */
export function joinSerials(existing, qty) {
  return cleanSerials(existing, qty).filter(Boolean).join(", ");
}

/**
 * Every serial on a line, whichever way it was stored. Sales saved before
 * serials were per-unit have only the joined string, so an old receipt
 * reprints exactly as it did.
 */
export function readSerials(item) {
  const list = Array.isArray(item?.imeis) && item.imeis.length
    ? item.imeis
    : String(item?.imei || "").split(",");
  return list.map((v) => String(v || "").trim()).filter(Boolean);
}
