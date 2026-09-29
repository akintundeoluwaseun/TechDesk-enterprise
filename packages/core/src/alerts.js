// What is worth a system notification, worded the way a shop would say it.
//
// Three kinds:
//   arrival      "Ade made a sale" -- a sale or job someone else rang up,
//                just synced to this device. Once each.
//   owed         "Bola hasn't paid" -- money still owed after a few days.
//   uncollected  "Chidi hasn't come for his laptop" -- finished, still here.
//
// The last two are states, not events, so they repeat: every five hours
// until the money is in or the customer has collected. There is no switch
// for them -- a shop owner who is owed money wants to hear about it, and
// the reminder stops by itself the moment it stops being true. Everything
// here is pure -- the app shows the notification, core decides what it says
// and whether it is due.

import { storage } from "./storage";
import { saleOwed, repairOwed, repairTotal } from "./summary";
import { money } from "./currency";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** How often a reminder repeats, and how long after the sale the first one comes. */
export const REMIND_EVERY_MS = 5 * HOUR;

const KEY_LOG = "techdesk_alert_log";
const LOG_MAX = 400;

function time(iso) {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function waited(t, now) {
  const hours = Math.floor((now - t) / HOUR);
  if (hours < 24) return `${Math.max(1, hours)} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor((now - t) / DAY);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function since(iso, now) {
  const d = new Date(iso);
  return new Date(now).toDateString() === d.toDateString() ? "earlier today" : `since ${shortDate(iso)}`;
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
 * Every owed / uncollected reminder currently true, oldest first. Each is
 * true from five hours after the sale (or after the job was finished) until
 * it is paid or collected. Whether each is DUE again is takeDue's job.
 */
export function reminderAlerts(sales = [], repairs = [], { now = Date.now(), settings = {} } = {}) {
  const out = [];
  const cut = now - REMIND_EVERY_MS;

  for (const s of sales) {
    const owed = saleOwed(s);
    const at = time(s?.createdAt);
    if (owed <= 0 || at === null || at > cut) continue;
    out.push({
      id: `owed:sale:${s.id}`,
      kind: "owed",
      at,
      title: `${who(s) || "A customer"} hasn't paid`,
      body: `${money(owed, settings)} owed ${since(s.createdAt, now)}${s.invoice ? ` · ${s.invoice}` : ""}`,
    });
  }
  for (const r of repairs) {
    // A job with no price on it yet owes nothing worth chasing.
    const owed = repairOwed(r);
    const at = time(r?.createdAt);
    if (owed <= 0 || repairTotal(r) <= 0 || at === null || at > cut) continue;
    out.push({
      id: `owed:repair:${r.id}`,
      kind: "owed",
      at,
      title: `${who(r) || "A customer"} hasn't paid`,
      body: `${money(owed, settings)} owed for the ${r.device || "repair"} ${since(r.createdAt, now)}${r.ticket ? ` · ${r.ticket}` : ""}`,
    });
  }

  for (const r of repairs) {
    if (String(r?.status || "").toLowerCase() !== "completed") continue;
    // When it was finished; older records only know when they last changed.
    const at = time(r.readyAt) ?? time(r.updatedAt) ?? time(r.createdAt);
    if (at === null || at > cut) continue;
    out.push({
      id: `ready:${r.id}`,
      kind: "uncollected",
      at,
      title: `${who(r) || "A customer"} hasn't come for their ${r.device || "device"}`,
      body: `Ready for ${waited(at, now)}${r.customerPhone ? ` · ${r.customerPhone}` : ""}${r.ticket ? ` · ${r.ticket}` : ""}`,
    });
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
 * reminder again every `repeatMs` (five hours) for as long as it is true. More than `max` at once collapse into
 * the first few plus one summary line, so a shop opening the app after a
 * week away gets three notifications, not forty.
 */
export function takeDue(alerts, { now = Date.now(), repeatMs = REMIND_EVERY_MS, max = 3 } = {}) {
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
