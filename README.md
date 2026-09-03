# TechDesk Solo

Offline-first repair shop manager (Sales/POS, Repairs, Inventory, Customers,
Reports, Activity Logs, Settings) built with React + Electron. All data lives
on-device in localStorage — no backend, no internet required for day-to-day
use.

On top of everything TechDesk 2.0 has (PIN login, multi-user roles), Solo
adds two extras: a one-click way to email yourself an activity report, and a
read-only activity log other devices on the same Wi-Fi can view.

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
and add seller/repairer staff accounts.

## Data & roles

- Everything (sales, repairs, inventory, customers, activity, settings, users)
  is stored in the browser's localStorage inside the Electron window — fully
  offline, per device.
- Roles: **admin** sees everything including the dashboard, reports, activity
  logs, settings, and inventory cost/valuation. **seller** sees Sales (POS) +
  Inventory. **repairer** sees Repairs + Inventory. A user can be assigned
  **both**. Non-admin roles never see cost price or total inventory value.
- Settings → Device has Download backup / Restore backup (JSON file), the
  email activity report, LAN connection info, and Erase all data.

## Project structure

```
src/
  App.jsx              routing + auth gate
  pages/                one file per screen
  pages/settings/        the Settings tabs, including Device (backup, email report, LAN)
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

TechDesk Solo saves an automatic backup once a day (to this device's Electron
`userData/backups` folder, keeping the last 14) as a safety net, on top of the
manual Download backup / Restore backup in Settings → Device.

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

## Receipts

Sales have two printable formats: a full A4 PDF invoice, and a 58mm
thermal-printer receipt (both from the Sales page, per transaction).

## Activation

The app ships with a hashed table of PIN/activation-code pairs (no plaintext
codes in the bundle). Each install is assigned one random PIN that persists
until activated; only the matching code unlocks it. A 7-day trial runs before
that's required — after it expires the app goes view-only until activated.
