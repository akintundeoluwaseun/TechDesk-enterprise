# @techdesk/editions

What each edition can do. Data, not code.

The tiers used to be three codebases, and the difference between them was
spread across 25 files — you found it by diffing. Moving a feature between
tiers meant editing three repositories and hoping. It is one list now, in
`src/capabilities.js`, and that list is the only place it exists.

| | Solo | Business | Enterprise |
|---|---|---|---|
| The shop (sales, repairs, inventory, customers, reports, receipts, backup…) | ✓ | ✓ | ✓ |
| Staff accounts, roles, PIN | — | ✓ | ✓ |
| Activation, Connect to HQ | — | ✓ | ✓ |
| LAN activity, multi-branch | — | — | ✓ |
| Staff limit | 1 | 3 | unlimited |

## Build time, not run time

`TECHDESK_EDITION` is read by `vite.config.mjs` and compiled in. There is no
setting to read and none to write.

That is the point. An edition kept in localStorage is an edition the customer
can change, and the devtools are one keystroke away — a Solo licence would
become Enterprise in about ten seconds. Being a build constant also means each
flag is a literal `true` or `false` by the time the bundler sees it, so a
branch guarded by a capability this edition lacks is deleted, along with
whatever it imported.

Measured, on the three real builds:

| | size | chunks | UsersTab | ConnectHq | Settings tabs |
|---|---|---|---|---|---|
| solo | 2032K | 21 | absent | absent | Shop, Receipts, Device, Developer |
| business | 2064K | 25 | present | present | …plus Users and Connect to HQ |
| enterprise | 2064K | 25 | present | present | …plus Users and Connect to HQ |

No build contains another edition's name.

**This is not the whole security story, and should not be mistaken for it.**
Any binary can be patched by someone determined — an Electron app is a zip.
What this buys is that casual escalation is off the table: there is no flag to
flip. Anything genuinely worth money must *also* be enforced server-side, and
HQ already is: a branch cannot connect without a code the backend issues.

## Two ways to ask

```js
can("hq")     // readable, for a decision the UI makes — show a tab or not
__CAN_HQ__    // the same answer, written so the bundler can fold it and
              // delete the import behind it
```

Use `can()` by default. Use `__CAN_X__` where the code itself should not ship,
rather than ship and be hidden. Both are generated from the one list by
`defineFlags()`, so they cannot disagree.

## Two traps this package exists to have already hit

**`JSON.stringify(Infinity)` is `"null"`.** Enterprise's unlimited staff limit
would have compiled to `null`, and `count < null` is `false` — unlimited would
have become a limit of zero, in the one edition sold on not having one. A test
caught it before it was ever built.

**An unknown edition throws rather than falling back.** Defaulting to solo
would ship a crippled binary labelled Enterprise; defaulting to enterprise
would give the product away. Neither is discoverable until a customer finds it.

## Explicit `.js` in imports

Unlike `core` and `platform`, this package is imported by `vite.config.mjs`,
so Node's own ESM resolver loads it — and that one does not guess at
extensions. Leaving them off fails at build-config load time, which is a
confusing place to find out.
