// Reading the activation table.
//
// TWO FILES, ON PURPOSE.
//
// activationMeta.json is tiny and loads with the app: how many PINs exist and
// which tiers have a column. That is everything needed before someone has
// actually asked to upgrade something.
//
// activationHashes.json is the table itself, twenty thousand rows and over a
// megabyte, and it is needed exactly twice in a shop's life -- to show their
// PIN and to check a code they typed. Importing it at the top of this file
// put all of it in the startup bundle, which every shop that never upgrades
// pays for every morning on a phone that is not fast. So it is loaded on
// demand, which is what makes the accessors below async.
//
// The rows themselves are stored positionally -- a header naming the tiers,
// then one array per PIN, hashes in that order -- because repeating the words
// "business" and "enterprise" twenty thousand times costs half a megabyte of
// install for no reader's benefit. That trade is fine as long as the
// positional part stays in this file. Nothing else should know that column 1
// is business; it asks for the hashes on a PIN and gets them labelled.
import meta from "../data/activationMeta.json";

/** The tiers the table has a column for, in column order. Never "free". */
export const TABLE_TIERS = meta.tiers;

/** How many PINs exist. The range a device draws its own from. */
export const TABLE_SIZE = meta.size;

/** Is this a row that exists? Answerable without the table. */
export function isValidIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < TABLE_SIZE;
}

let pending = null;

/** The table, fetched once and kept. */
export function loadTable() {
  if (!pending) {
    pending = import("../data/activationHashes.json")
      .then((mod) => mod.default || mod)
      .catch((err) => {
        // Let the next caller try again rather than caching the failure --
        // a chunk that failed to load once is a shop that cannot activate
        // until they restart, for a file that is sitting on their own disk.
        pending = null;
        throw err;
      });
  }
  return pending;
}

/** The PIN a device at this row shows, or null if the row is not there. */
export async function pinAt(index) {
  if (!isValidIndex(index)) return null;
  const table = await loadTable();
  return table.entries[index][0];
}

/**
 * Every code this PIN can be sold, as {tier, hash}.
 *
 * A list rather than a pair. Today it is business and enterprise, and the
 * shape of an upgrade is "try them all and take the best one that matches" --
 * which reads the same whether there are two of them or five.
 */
export async function hashesAt(index) {
  if (!isValidIndex(index)) return [];
  const table = await loadTable();
  const row = table.entries[index];
  return TABLE_TIERS.map((tier, column) => ({ tier, hash: row[column + 1] }));
}
