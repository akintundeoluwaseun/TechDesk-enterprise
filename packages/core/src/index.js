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
  getCachedAccountStatus, leaveRemovedShop, takeRemovedNotice,
} from "./account";
// A disconnect the server has not been told about yet. The app retries it;
// these are exported so the retry can be tested without a live server.
export { rememberRevoke, pendingRevoke, clearRevoke } from "./hqStore";

// The numbers the top of each page reports, in one place, because three
// screens and an export have to agree about what a repair costs.
export {
  isToday, startOfDay, startOfWeek, startOfMonth, groupByPeriod,
  repairTotal, repairOwed, saleOwed, isOpenRepair,
  repairsSummary, salesSummary, customerKey, customerTotals, customersSummary,
  pendingPaymentsSummary,
} from "./summary";

export { computeReport, reportToCsv, getRangeStart } from "./reports";

// The 3-hourly pending-payment reminder's clock -- see the note at the top
// of owedReminder.js for why "last reminded" is a persisted timestamp
// rather than a plain setInterval.
export {
  REMINDER_INTERVAL_MS, getLastRemindedAt, setLastRemindedAt, dueForReminder,
} from "./owedReminder";
export { searchEverything } from "./searchAll";
export { notificationFeed, isUnread, unreadCount, timeAgo } from "./notifications";
export { searchDestinations, DESTINATIONS } from "./destinations";
export { rowsToCsv } from "./csv";
export { checkout } from "./checkout";
export { readAppControl, saveAppControl, featureOn, pausedResult, FEATURES } from "./appControl";
export { voiceOrder, matchProduct, matchCustomer, matchRepair, PAYMENT_METHODS as VOICE_PAYMENT_METHODS } from "./voiceOrder";
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

// Who made a record, and what is worth a system notification about it.
export { deviceId, setAuthorName, authorName } from "./author";
export { onArrived } from "./arrivals";
export {
  REMIND_EVERY_MS, arrivalAlert, arrivalAlerts,
  reminderAlerts, takeDue, alertLog,
} from "./alerts";
export { buildBrief, briefText, briefDue, briefOff, setBriefOff, markBriefSeen, MORNING_ENDS_AT } from "./morningBrief";
export { debtors, debtorKey, chaseMessage, markChased, setPromise, recordPayment, runChaseUndo, toneFor, chaseLog, TONES, TONE_LABEL, LANGS, GRACE_DAYS } from "./moneyChaser";
export { answerQuestion, PERIOD_LABEL } from "./assistantAnswers";
