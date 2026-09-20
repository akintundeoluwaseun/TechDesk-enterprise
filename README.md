# TechDesk

One shop product. Three desktop editions, a web app, and an Android app, built
from the same code.

    apps/
      desktop/    Electron. Solo, Business, Enterprise — one source, three builds.
      monitor/    TechDesk Monitor (Android). A lodger; it moves to its own repo at step 10.
    packages/     Shared code. Empty until step 2 — see packages/README.md.
    services/
      relay/      Cloudflare worker for activation lookups.

## Running it

    npm install
    npm test              # every workspace
    npm run dev           # renderer on :5173
    npm run electron:dev  # the desktop app
    npm run build         # renderer -> apps/desktop/dist
    npm run dist          # installers -> apps/desktop/release

Node 20 or newer. `apps/monitor` is deliberately **not** a workspace member —
it is a separate product with its own lockfile and its own Node 22 floor, and
it leaves this repo once the shop apps are merged.

## Where things stand

This repo is mid-merge. It currently holds the Enterprise edition, moved to its
new path and nothing more. `packages/` is empty, and Solo, Business, the Web
App and Android are still in their own repositories.

- The plan: `docs/TechDesk-merge-master-plan.md` in `techdesk-website-`
- The originals and their frozen commits: [REFERENCE.md](REFERENCE.md)
- How the product actually works: `docs/TechDesk-how-it-works.txt` in `techdesk-website-`

Nothing here is a rewrite. The four shop apps already share about 95% of their
code; the job is to extract the ~2,000 lines that genuinely differ and delete
the duplicates.
