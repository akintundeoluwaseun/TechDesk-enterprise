# TechDesk Enterprise

Offline-first repair shop manager for larger teams (Sales/POS, Repairs,
Inventory, Customers, Reports, Activity Logs, Settings) built with React +
Electron. All data lives on-device in localStorage — no backend, no internet
required for day-to-day use.

This is one of three TechDesk editions, aimed at different business sizes:

- **Solo** — a single owner/technician. No login screen, no staff accounts.
- **Business** — a small shop with a few staff: PIN login, roles
  (admin/seller/repairer), up to 3 staff accounts, plus an email activity
  report.
- **Enterprise** (this one) — unlimited staff accounts, plus LAN activity
  sharing on top of everything Business has.

Each edition also has its own visual identity: Business uses a translucent
"liquid glass" look, Enterprise uses a soft-UI "neumorphic" look (flat
surfaces, no borders, depth from paired light/dark shadows) — set once in
`src/lib/ThemeContext.jsx`.

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

## First run

On first launch you'll land on the user-select / PIN screen. The default admin
PIN is `0000` — sign in as Admin, then go to Settings → Users to set a real PIN
and add seller/repairer staff accounts (no limit on this edition).

## Data & roles

- Everything (sales, repairs, inventory, customers, activity, settings, users)
  is stored in the browser's localStorage inside the Electron window — fully
  offline, per device.
- Roles: **admin** sees everything including the dashboard, reports, activity
  logs, settings, and inventory cost/valuation. **seller** sees Sales (POS) +
  Inventory. **repairer** sees Repairs + Inventory. A user can be assigned
  **both**. Non-admin roles never see cost price or total inventory value.
- Settings → Users has no cap on staff accounts (Business is capped at 3).
- Settings → Device has Download backup / Restore backup (JSON file), the
  email activity report, LAN connection info, and Erase all data.

## Project structure

```
src/
  App.jsx              routing + auth gate
  pages/                one file per screen
  pages/settings/        the 5 Settings tabs, including Device (backup, email report, LAN)
  components/           shared Sidebar, Topbar, modals
  lib/db.js              localStorage data layer
  lib/AuthContext.jsx    PIN session + role permissions
  lib/ThemeContext.jsx   light/dark theme
  lib/generateInvoicePdf.js   Sales receipt PDF
  lib/generateRepairPdf.js    Repair ticket + blank 3-copy form PDFs
  lib/reports.js         report aggregation
electron/
  main.js                Electron main process: local backups, LAN activity
                          server + QR code
  preload.js              exposes the techdesk bridge to the renderer
```

## Backups

TechDesk Enterprise saves an automatic backup once a day (to this device's
Electron `userData/backups` folder, keeping the last 14) as a safety net, on
top of the manual Download backup / Restore backup in Settings → Device.

## Email activity report

Settings → Device has an "Email activity report" button. It opens your own
Mail app with recent activity pre-filled, addressed to whichever email you
enter — you review it and hit send yourself. No password is ever typed into
or stored by the app, and nothing is sent automatically in the background.

## LAN activity sharing

The Electron main process runs a small local HTTP server (port 47821) that
serves a read-only, auto-refreshing activity log page. Settings → Device
shows this device's LAN address and a "Show connection QR" button — scan it
from another device on the same Wi-Fi to open the log in a browser. Nothing
here is writable from the other device; it's view-only.

## Upgrading to a different edition

There's no in-place upgrade — each edition is a separate install. To move
your data from one edition to another (e.g. Business → Enterprise as your
team grows past 3 staff):

1. On the old edition, go to Settings → Device → Download backup and save
   the JSON file somewhere safe.
2. Install the new edition.
3. On first run, go to Settings → Device → Restore backup and pick that
   same JSON file.

Backups are plain JSON (sales, repairs, inventory, customers, activity,
settings) and aren't edition-specific, so a Business backup restores cleanly
into Enterprise, staff accounts included, with no extra steps.

## Uninstalling

The Windows uninstaller asks whether you've backed up your data before it
proceeds — answering "No" cancels the uninstall so you can back up first
via Settings → Device → Download backup. Uninstalling never deletes your
saved data either way; it only removes the app itself.

## Receipts

Sales have two printable formats: a full A4 PDF invoice, and a 58mm
thermal-printer receipt (both from the Sales page, per transaction).

## Activation

The app ships with a hashed table of PIN/activation-code pairs (no plaintext
codes in the bundle). Each install is assigned one random PIN that persists
until activated; only the matching code unlocks it. A 7-day trial runs before
that's required — after it expires the app goes view-only until activated.
