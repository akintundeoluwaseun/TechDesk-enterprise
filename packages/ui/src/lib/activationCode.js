// The shape of an activation code, decided in exactly one place.
//
// Two programs have to agree about this perfectly: the app, which verifies a
// code a shop types at the counter, and scripts/generate-activation-table.mjs,
// which mints them months earlier. Every detail below is something they could
// silently disagree about -- the alphabet, how a typed code is cleaned up,
// what exactly gets hashed, how much of the digest is kept -- and every
// disagreement produces the same symptom: a code that is correct on the paper
// in your hand and rejected on the screen in front of the customer.
//
// So neither side owns it. This file does, and both import it.

// Crockford's base32 alphabet: no I, L, O or U. The first three are the
// characters people mix up with 1 and 0 when a code is read down a phone
// line, which is how these codes actually travel. U is left out so a random
// code cannot spell something you would rather not read out.
export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// 12 symbols x 5 bits = 60 bits. Long enough that nobody guesses one, short
// enough to read out twice without losing your place.
export const CODE_LENGTH = 12;

// Shown as XXXX-XXXX-XXXX. The dashes are punctuation, not data -- they are
// stripped before anything is hashed, so a shop may type them or not.
export const GROUP_SIZE = 4;

// How much of the SHA-256 the table keeps. 80 bits: far past any chance of
// two codes colliding, and a quarter the size of the full digest across
// tens of thousands of rows, which is a megabyte of install.
export const HASH_HEX = 20;

/**
 * What the shop typed, turned back into what was issued.
 *
 * Dashes and spaces go. Case does not matter. And the three letters the
 * alphabet deliberately excludes are folded to the digits they get mistaken
 * for, so a customer reading "I" where the paper says "1" still activates
 * instead of ringing you.
 *
 * Anything else unexpected is LEFT IN, not quietly dropped: a stray character
 * should fail the check and get a "that code doesn't match", which is the
 * truth, rather than be deleted until the remainder happens to match.
 */
export function normalizeCode(input) {
  return String(input == null ? "" : input)
    .toUpperCase()
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/[^0-9A-Z]/g, "");
}

/** XXXX-XXXX-XXXX, for printing and for the CSV you sell from. */
export function formatCode(raw) {
  const clean = normalizeCode(raw);
  return (clean.match(new RegExp(`.{1,${GROUP_SIZE}}`, "g")) || []).join("-");
}

/**
 * Exactly what gets hashed.
 *
 * The tier is in here on purpose. Without it a code is just "a code that
 * belongs to this PIN", and the only thing separating the Business code from
 * the Enterprise one is which column of the table it was compared against --
 * so a bug that compared against the wrong column would hand out Enterprise
 * for a Business payment. With the tier in the preimage, a Business code
 * cannot produce the Enterprise hash no matter what compares it.
 */
export function hashPreimage(pin, tier, code) {
  return `${pin}:${tier}:${normalizeCode(code)}`;
}
