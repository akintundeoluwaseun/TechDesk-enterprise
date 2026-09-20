# @techdesk/core

What a TechDesk shop *is*, with nothing about where it is running.

No React. No DOM. No `window`. No `localStorage`. Every test in here runs under
plain Node, and that is the contract: if a test in this package ever needs a
browser, something platform-specific has leaked in and the failure is the
alarm.

## What's in it

    db.js            sales, repairs, inventory, customers, activity, backups
    reports.js       revenue, cost, profit, the CSV
    receipts/        builds the A4 receipt, the 58mm receipt, the repair ticket,
                     the reports PDF -- and hands each back as a document
    notifications.js the feed, and what counts as unread
    searchAll.js     search across everything
    hq.js            the head-office sync client
    currency.js      money, and the ₦ problem
    destinations.js, csv.js, pdfSafe.js, businessPresets.js

## The three bindings

Core is told about its host at startup. Nothing reaches for a global.

    setStorage(localStorage)         where records are kept
    setChangeSink(fn)                what "the shop changed" does
    setHostBridge(window.techdesk)   the native side, when there is one

Bind none of them and core still works: records go in memory, nothing is
announced, and there is no native side. That is exactly what a unit test wants,
and it is also what a browser tab with no Electron behind it is.

**Bind at the app's entry point, before anything reads a record.** Doing it as
a side effect of importing the data layer looks equivalent and is not: anything
that reaches core another way gets the unbound store instead, reads a shop with
no settings in it, and carries on without throwing. That bug shipped receipts
with the shop's logo missing, and `bindCoreIsWired.test.js` in the desktop app
exists so it cannot come back quietly.

## Receipts build; they do not deliver

`buildInvoicePdf(sale)` returns a document. It does not save it, print it, or
share it, because each platform does those differently and none of them belong
in a function that draws a table. The host wraps it — see
`apps/desktop/src/lib/generateInvoicePdf.js`, which is the whole delivery
layer in fifteen lines.

## Running the tests

    npm test -w @techdesk/core
