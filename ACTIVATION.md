# Activation

How a shop pays for TechDesk, and what you do when they ring.

## The short version

One app. Everyone downloads the same thing and uses it free, forever. Paid
tiers unlock **in place** — no second download, no reinstall, no export and
import of their records.

Each device shows a six-digit **PIN**. Every PIN has two codes against it, one
for Business and one for Enterprise. A shop reads you their PIN, pays, and you
read back the code for the tier they bought. They type it in and the locks come
off while they are standing there.

A second sale to the same shop is the second code on the same PIN. Nothing else
changes.

## Selling a code

1. They open the app and hit something locked, or press the button at the
   bottom of the sidebar. The upgrade screen shows their PIN.
2. They send you the PIN.
3. Find that PIN in `secrets/activation-codes.csv` and take the code from the
   `business` or `enterprise` column, whichever they paid for.
4. Send it. `XXXX-XXXX-XXXX`. Dashes, spaces and case do not matter, and the
   letters I, L and O are treated as 1, 1 and 0, so a misread is usually
   forgiven.

There is no server in any of this. It works in a shop with no data on a phone
with no credit, which is most of them.

## Rules the app follows

- **Upgrades only.** A code for a tier they already hold does nothing and says
  "already active". An Enterprise shop cannot be knocked back to Business by
  someone retyping the old code.
- **A code only works on its own PIN.** It is worthless anywhere else.
- **A Business code cannot unlock Enterprise.** The tier is part of what gets
  hashed, so the two are not interchangeable even by accident.
- **It sticks.** The tier is written to localStorage *and* to a file in the
  app's own data folder, and the file wins. A cleared browser profile does not
  cost a shop what they paid for.
- **It is remembered.** The upgrade screen lists what was unlocked and when,
  which is what you ask them to read out when something is wrong.

## `secrets/activation-codes.csv`

This file is the business. It is the only copy of every code, it is not in git
and never will be, and it cannot be recovered from the app — the app ships
hashes, which is exactly why nobody can read a code out of the installer.

**Back it up somewhere that is not the laptop that made it.**

Regenerating it invalidates every code in it. The generator refuses to run if
the file already exists for that reason; `--force` is the "I have moved the old
one somewhere safe" switch.

## Regenerating the table

```
npm run activation:generate
```

Writes three things:

| file | where it goes |
| --- | --- |
| `packages/ui/src/data/activationHashes.json` | ships in the app, hashes only, loaded on demand |
| `packages/ui/src/data/activationMeta.json` | ships in the app, tiny, read at startup |
| `secrets/activation-codes.csv` | stays with you |

Adding a tier to `packages/editions/src/capabilities.js` adds a column to both
the table and the CSV on the next run. Twenty thousand PINs, so two unrelated
shops drawing the same one stays rare well past any number of customers this
was built for.

## What this does and does not defend

The table is inside the app and the tier is a flag on the customer's own
machine. Somebody determined can change it. That is the price of unlocking in
place and working offline, and it was chosen deliberately.

So the local features — staff accounts, the PIN lock, PDF receipts, WhatsApp —
are honour-system. Price on the assumption that a few people will not pay.

What is actually enforced is the server side: head office sync and branch
connect check `businesses.plan` and refuse a shop that has not paid, and no
amount of editing localStorage forges that. HQ, multi-branch and LAN are the
features that cannot be taken for free, which is worth remembering when
deciding what belongs in which tier.
