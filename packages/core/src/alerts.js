// What is worth a system notification, worded the way a shop would say it.
//
// Three kinds:
//   arrival      "Ade made a sale" -- a sale or job someone else rang up,
//                just synced to this device. Once each.
//   owed         "Bola hasn't paid" -- money still owed after a few days.
//   uncollected  "Chidi hasn't come for his laptop" -- finished, still here.
//
// The last two are states, not events, so they repeat: once a day while they
// stay true, never more. Everything here is pure -- the app decides whether
// to show a notification, core decides what it says and whether it is due.

import { storage } from "./storage";
import { saleOwed, repairOwed, repairTotal } from "./summary";
import { money } from "./currency";

const DAY = 24 * 60 * 60 * 1000;

export const ALERT_DEFAULTS = {
  enabled: true,
  arrivals: true,   // sales and jobs from other devices / branches
  owed: true,
  uncollected: true,
  owedAfterDays: 3,
  uncollectedAfterDays: 3,
};

const KEY_PREFS = "techdesk_alert_prefs";
const KEY_LOG = "techdesk_alert_log";
const LOG_MAX = 400;

export function alertPrefs() {
  try {
    const raw = storage.getItem(KEY_PREFS);
    return { ...ALERT_DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...ALERT_DEFAULTS };
  }
}

export function setAlertPrefs(patch) {
  const next = { ...alertPrefs(), ...patch };
  storage.setItem(KEY_PREFS, JSON.stringify(next));
  return next;
}

function time(iso) {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function daysAgo(t, now) {
  const days = Math.floor((now - t) / DAY);
  return days <= 1 ? "a day" : `${days} days`;
}

function who(record) {
  return String(record?.customerName || "").trim() || null;
}

function itemsLine(items) {
  const list = Array.isArray(items) ? items.filter((i) => i?.name) : [];
  if (!list.length) return "";
  const first = `${Number(list[0].qty) > 1 ? `${list[0].qty} × ` : ""}${list[0].name}`;
  return list.length > 1 ? `${first} +${list.length - 1} more` : first;
}

/** "Ade made a sale" -- built from a record another device made. */
export function arrivalAlert({ kind, record }, settings = {}) {
  const by = record?.byName || "Someone";
  if (kind === "sale") {
    const parts = [
      money(Number(record.total) || 0, settings),
      itemsLine(record.items),
      who(record) ? `to ${who(record)}` : null,
      record.paymentStatus && record.paymentStatus !== "Paid" ? record.paymentStatus.toLowerCase() : null,
    ].filter(Boolean);
    return {
      id: `sale:${record.id}`,
      kind: "arrival",
      title: `${by} made a sale`,
      body: parts.join(" · "),
    };
  }
  const device = record?.device || record?.deviceType || "a device";
  return {
    id: `repair:${record.id}`,
    kind: "arrival",
    title: `${by} booked in a repair`,
    body: [device, record?.problem, who(record) ? `for ${who(record)}` : null].filter(Boolean).join(" · "),
  };
}

/**
 * Every owed / uncollected reminder currently true, oldest first. Whether
 * each is DUE (not already shown today) is dueAlerts' job, not this one's.
 */
export function reminderAlerts(sales = [], repairs = [], { now = Date.now(), prefs = alertPrefs(), settings = {} } = {}) {
  const out = [];
  const owedCut = now - prefs.owedAfterDays * DAY;
  const readyCut = now - prefs.uncollectedAfterDays * DAY;

  if (prefs.owed) {
    for (const s of sales) {
      const owed = saleOwed(s);
      const at = time(s?.createdAt);
      if (owed <= 0 || at === null || at > owedCut) continue;
      out.push({
        id: `owed:sale:${s.id}`,
        kind: "owed",
        at,
        title: `${who(s) || "A customer"} hasn't paid`,
        body: `${money(owed, settings)} owed since ${shortDate(s.createdAt)}${s.invoice ? ` · ${s.invoice}` : ""}`,
      });
    }
    for (const r of repairs) {
      // A job with no price on it yet owes nothing worth chasing.
      const owed = repairOwed(r);
      const at = time(r?.createdAt);
      if (owed <= 0 || repairTotal(r) <= 0 || at === null || at > owedCut) continue;
      out.push({
        id: `owed:repair:${r.id}`,
        kind: "owed",
        at,
        title: `${who(r) || "A customer"} hasn't paid`,
        body: `${money(owed, settings)} owed for the ${r.device || "repair"} since ${shortDate(r.createdAt)}${r.ticket ? ` · ${r.ticket}` : ""}`,
      });
    }
  }

  if (prefs.uncollected) {
    for (const r of repairs) {
      if (String(r?.status || "").toLowerCase() !== "completed") continue;
      // When it was finished; older records only know when they last changed.
      const at = time(r.readyAt) ?? time(r.updatedAt) ?? time(r.createdAt);
      if (at === null || at > readyCut) continue;
      out.push({
        id: `ready:${r.id}`,
        kind: "uncollected",
        at,
        title: `${who(r) || "A customer"} hasn't come for their ${r.device || "device"}`,
        body: `Ready for ${daysAgo(at, now)}${r.customerPhone ? ` · ${r.customerPhone}` : ""}${r.ticket ? ` · ${r.ticket}` : ""}`,
      });
    }
  }

  return out.sort((a, b) => a.at - b.at);
}

export function alertLog() {
  try {
    const raw = storage.getItem(KEY_LOG);
    const log = raw ? JSON.parse(raw) : {};
    return log && typeof log === "object" && !Array.isArray(log) ? log : {};
  } catch {
    return {};
  }
}

function saveLog(log) {
  const entries = Object.entries(log).sort((a, b) => b[1] - a[1]).slice(0, LOG_MAX);
  storage.setItem(KEY_LOG, JSON.stringify(Object.fromEntries(entries)));
}

/**
 * The ones to show now, and marks them shown. An arrival shows once ever; a
 * reminder once per `repeatMs` (a day). More than `max` at once collapse into
 * the first few plus one summary line, so a shop opening the app after a
 * week away gets three notifications, not forty.
 */
export function takeDue(alerts, { now = Date.now(), repeatMs = DAY, max = 3 } = {}) {
  const log = alertLog();
  const due = alerts.filter((a) => {
    const last = log[a.id];
    if (!last) return true;
    return a.kind !== "arrival" && now - last >= repeatMs;
  });
  if (!due.length) return [];
  for (const a of due) log[a.id] = now;
  saveLog(log);

  if (due.length <= max) return due;
  const shown = due.slice(0, max - 1);
  const rest = due.length - shown.length;
  const owed = due.slice(max - 1).filter((a) => a.kind === "owed").length;
  const ready = due.slice(max - 1).filter((a) => a.kind === "uncollected").length;
  const arrivals = rest - owed - ready;
  const bits = [
    arrivals ? `${arrivals} more from your team` : null,
    owed ? `${owed} more unpaid` : null,
    ready ? `${ready} more waiting to be collected` : null,
  ].filter(Boolean);
  return [...shown, { id: `summary:${now}`, kind: "summary", title: `${rest} more need a look`, body: bits.join(" · ") }];
}

/**
 * Arrival alerts for records made recently. A device's first sync pulls the
 * shop's whole history -- none of that is news, so anything made more than
 * `windowMs` ago is left out.
 */
export function arrivalAlerts(items, settings = {}, { now = Date.now(), windowMs = 12 * 60 * 60 * 1000 } = {}) {
  return (items || [])
    .filter(({ record }) => {
      const t = time(record?.createdAt);
      return t !== null && now - t <= windowMs;
    })
    .map((item) => arrivalAlert(item, settings));
}
