#!/usr/bin/env node
//
// Mints the activation table.
//
// It writes two files, and the difference between them is the whole system:
//
//   packages/ui/src/data/activationHashes.json  ships inside every copy of
//     the app. It holds PINs and HASHES -- never a code. Somebody who unzips
//     the installer learns nothing they can type in.
//
//   secrets/activation-codes.csv  never leaves your machine. It is the list
//     you sell from: a shop reads you their PIN, you find the row, you read
//     back the code for the tier they paid for.
//
// THERE IS NO SERVER IN THIS. Nothing phones home, nothing has to be online,
// and a shop in a compound with no data activates in the same ten seconds as
// one on fibre. The cost of that is this file: lose the CSV and you cannot
// issue another code for any PIN in it, ever. Back it up somewhere that is
// not this laptop, today.
//
// Run:  npm run activation:generate
//
import { randomInt, randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALPHABET,
  CODE_LENGTH,
  HASH_HEX,
  formatCode,
  hashPreimage,
} from "../packages/ui/src/lib/activationCode.js";
import { TIERS } from "../packages/editions/src/capabilities.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TABLE_PATH = resolve(ROOT, "packages/ui/src/data/activationHashes.json");
const META_PATH = resolve(ROOT, "packages/ui/src/data/activationMeta.json");
const CSV_PATH = resolve(ROOT, "secrets/activation-codes.csv");

// Every tier except free. Free is what you get for downloading it, so there
// is nothing to issue. Taken from the capability map rather than written out
// here, so adding a tier there adds a column here on the next run.
const PAID_TIERS = TIERS.filter((tier) => tier !== "free");

// How many PINs exist. This is the number that decides how often two
// unrelated shops draw the same one -- a device picks its index at random,
// so with N rows and n installs you should expect about n squared over 2N
// pairs to collide. At 20,000 rows, a thousand shops gives you roughly
// twenty-five pairs; at the old 5,000 it was a hundred. A collision is not a
// disaster (both shops get a working PIN and you can see it in the CSV) but
// it does mean one shop's code opens another's copy, so the number wants to
// be comfortably larger than every shop you ever expect to sell to.
const ENTRIES = 20000;

const force = process.argv.includes("--force");

function mintPin(used) {
  for (;;) {
    // Six digits, never starting with a zero -- a leading zero is the digit
    // people drop when they read a number out, and a PIN that arrives one
    // digit short is a support call.
    const pin = String(randomInt(100000, 1000000));
    if (!used.has(pin)) {
      used.add(pin);
      return pin;
    }
  }
}

function mintCode(used) {
  for (;;) {
    // The alphabet is exactly 32 long, so five bits of a random byte index
    // it with no bias at all. Anything that is not a power of two here would
    // quietly weight the early letters.
    const bytes = randomBytes(CODE_LENGTH);
    let code = "";
    for (const b of bytes) code += ALPHABET[b & 31];
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
  }
}

function digest(pin, tier, code) {
  return createHash("sha256").update(hashPreimage(pin, tier, code)).digest("hex").slice(0, HASH_HEX);
}

function main() {
  if (existsSync(CSV_PATH) && !force) {
    console.error(
      [
        "",
        `Refusing to run: ${CSV_PATH} already exists.`,
        "",
        "That file is the only copy of every code it holds. Regenerating",
        "replaces all of them, and any code already given to a shop stops",
        "working the moment they update the app.",
        "",
        "If you are certain -- no codes sold, or you have moved the old file",
        "somewhere safe -- run it again with --force.",
        "",
      ].join("\n")
    );
    process.exitCode = 1;
    return;
  }

  const pins = new Set();
  const codes = new Set();
  const rows = [];
  const entries = [];

  for (let i = 0; i < ENTRIES; i += 1) {
    const pin = mintPin(pins);
    const plain = PAID_TIERS.map(() => mintCode(codes));
    entries.push([pin, ...PAID_TIERS.map((tier, t) => digest(pin, tier, plain[t]))]);
    rows.push([pin, ...plain.map(formatCode)].join(","));
  }

  // One entry per line. It is a generated file either way, but a line per
  // row means a diff can be read by a person if it ever needs to be.
  const table =
    "{\n" +
    '"version": 2,\n' +
    `"tiers": ${JSON.stringify(PAID_TIERS)},\n` +
    '"entries": [\n' +
    entries.map((row) => JSON.stringify(row)).join(",\n") +
    "\n]\n}\n";

  // The table is over a megabyte and is needed twice in a shop's life: to
  // show their PIN, and to check a code. So it is loaded on demand, and this
  // is what the app reads at startup instead -- the two facts it needs before
  // anyone has asked to upgrade anything.
  const meta = JSON.stringify({ version: 2, tiers: PAID_TIERS, size: entries.length }, null, 2) + "\n";

  mkdirSync(dirname(TABLE_PATH), { recursive: true });
  writeFileSync(TABLE_PATH, table);
  writeFileSync(META_PATH, meta);

  mkdirSync(dirname(CSV_PATH), { recursive: true });
  writeFileSync(CSV_PATH, ["pin," + PAID_TIERS.join(","), ...rows].join("\n") + "\n");

  const kb = (n) => `${Math.round(n / 1024)} KB`;
  console.log(`Wrote ${entries.length} PINs x ${PAID_TIERS.length} tiers (${PAID_TIERS.join(", ")}).`);
  console.log(`  ships with the app : ${TABLE_PATH} (${kb(Buffer.byteLength(table))}, loaded on demand)`);
  console.log(`  keep this private  : ${CSV_PATH}`);
  console.log("");
  console.log("Back the CSV up now. It cannot be regenerated from the app.");
}

main();
