// What the rest of TechDesk is allowed to use.
//
// Everything below runs with no DOM, no React, and no idea which app it is
// inside. Three bindings decide what that means in practice, and the host
// supplies them at startup:
//
//   setStorage(localStorage)   where records are kept
//   setChangeSink(fn)          what "the shop changed" does
//   setHostBridge(window.techdesk)  the native side, when there is one
//
// Bind none of them and core still works: it keeps records in memory and
// announces nothing, which is exactly what a unit test wants.

export { storage, setStorage, resetStorage, memoryStorage } from "./storage";
export { CHANGED_EVENT, setChangeSink, emitChanged } from "./events";
export { setHostBridge, hostBridge, hasHostBridge } from "./bridge";

export { db } from "./db";
export { hq, hqBridge, hqLocal } from "./hq";

// The shop's own cloud account: sign in or continue locally, and the push/
// pull that keeps a second signed-in device in step with this one. Separate
// from HQ (reporting up) and from sync (with one other person) -- see the
// note at the top of account.js.
export {
  account, accountBridge, accountLocal,
  getPushCursor, setPushCursor, getPullCursor, setPullCursor,
  getAccountGateDecision, setAccountGateDecision,
} from "./account";
// A disconnect the server has not been told about yet. The app retries it;
// these are exported so the retry can be tested without a live server.
export { rememberRevoke, pendingRevoke, clearRevoke } from "./hqStore";

// Syncing with one other person: their number, a code, and a link. Nothing
// to do with head office, which is the export above this one.
export {
  sync,
  mergeSynced,
  pruneUnreachable,
  changedSinceSync,
  SYNCABLE,
  syncLabel,
} from "./sync";

// The numbers the top of each page reports, in one place, because three
// screens and an export have to agree about what a repair costs.
export {
  isToday, startOfDay, repairTotal, repairOwed, isOpenRepair,
  repairsSummary, salesSummary, customerKey, customerTotals, customersSummary,
} from "./summary";

export { computeReport, reportToCsv, getRangeStart } from "./reports";
export { searchEverything } from "./searchAll";
export { notificationFeed, isUnread, unreadCount, timeAgo } from "./notifications";
export { searchDestinations, DESTINATIONS } from "./destinations";
export { rowsToCsv } from "./csv";
export { pdfSafe } from "./pdfSafe";
export * from "./currency";
export { DEFAULT_LABELS, BUSINESS_PRESETS } from "./businessPresets";

// Receipts: these build a document and return it. Saving, printing and
// sharing are the host's, because each platform does them differently and
// none of them belong in a function that draws a table.
export { receiptFilename } from "./receipts/filename";
export { buildInvoicePdf } from "./receipts/invoice";
export { buildThermalReceiptPdf } from "./receipts/thermal";
export { buildRepairTicketPdf, buildBlankRepairFormPdf } from "./receipts/repair";
export { buildReportPdf } from "./receipts/report";
