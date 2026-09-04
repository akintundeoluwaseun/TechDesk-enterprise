# TechDesk Solo

Offline-first repair shop manager for a **single operator** (Sales/POS,
Repairs, Inventory, Customers, Reports, Activity Logs, Settings) built with
React + Electron. All data lives on-device in localStorage — no backend, no
internet required.

This is one of three TechDesk editions, aimed at different business sizes:

- **Solo** (this one) — a single owner/technician. No login screen, no staff
  accounts to manage — the app opens straight to the dashboard.
- **Business** — a small shop with a few staff: PIN login, roles
  (admin/seller/repairer), plus email activity reports and LAN activity
  sharing.
- **Enterprise** — larger operations, same feature set as Business.

## Setup

```bash
npm install
```

## Run in development (hot reload, Electron window)

```bash
npm run electron:dev
```

## Run just the web app in a browser (for quick UI checks)

```bash
npm run dev
```

## Build installers (Windows/macOS/Linux)

```bash
npm run dist
```

Installers are written to `release/`. Run this on each target OS (or use CI) to
produce that platform's installer — electron-builder does not cross-compile
Windows installers from Linux/macOS reliably without extra setup (Wine).

## Data

Everything (sales, repairs, inventory, customers, activity, settings) is
stored in the browser's localStorage inside the Electron window — fully
offline, per device. There's a single Administrator account; no PIN, no
staff roles, no Users tab.

## Project structure

```
src/
  App.jsx              routing (no auth gate — always signed in as Admin)
  pages/                one file per screen
  pages/settings/        the Settings tabs (Shop, Receipts, Device, Developer)
  components/           shared Sidebar, Topbar, modals
  lib/db.js              localStorage data layer
  lib/ThemeContext.jsx   light/dark theme
  lib/generateInvoicePdf.js   Sales receipt PDF
  lib/generateRepairPdf.js    Repair ticket + blank 3-copy form PDFs
  lib/reports.js         report aggregation
electron/
  main.js                Electron main process
  preload.js              exposes the techdesk bridge to the renderer
```

## Backups

TechDesk Solo saves an automatic backup once a day (to this device's Electron
`userData/backups` folder, keeping the last 14) as a safety net, on top of the
manual Download backup / Restore backup in Settings → Device.

## Receipts

Sales have two printable formats: a full A4 PDF invoice, and a 58mm
thermal-printer receipt (both from the Sales page, per transaction).

## Activation

The app ships with a hashed table of PIN/activation-code pairs (no plaintext
codes in the bundle). Each install is assigned one random PIN that persists
until activated; only the matching code unlocks it. A 7-day trial runs before
that's required — after it expires the app goes view-only until activated.
