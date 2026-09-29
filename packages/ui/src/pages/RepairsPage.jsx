import React, { useState } from "react";
import { Plus, Search, FileText, MessageCircle, Trash2, ChevronRight } from "lucide-react";
import Topbar from "../components/Topbar";
import NewRepairModal from "../components/NewRepairModal";
import SignatureField from "../components/SignatureField";
import PeriodGroup from "../components/PeriodGroup";
import { useThemeTokens } from "../lib/ThemeContext";
import { useSettings } from "../lib/SettingsContext";
import { db } from "../lib/db";
import { money } from "../lib/currency";
import { useAuth } from "../lib/AuthContext";
import { repairsSummary, repairTotal, repairOwed, groupByPeriod } from "@techdesk/core";
import { generateRepairTicketPdf, generateBlankRepairFormPdf } from "../lib/generateRepairPdf";
import { IS_ANDROID_APP } from "../lib/platform";

// What the ticket button does, said accurately for the shell it is in.
//
// Android's WebView has no PDF viewer and no print service a web page can
// reach, so the ticket goes to the system sheet -- which is where the
// printer, WhatsApp and Files all are. That is the only route there is, but
// a button labelled "Print" that opens a share sheet reads as a bug, so it
// says what will actually happen.
const TICKET_ACTION = IS_ANDROID_APP ? "Print or send the ticket" : "Print";
import { openWhatsApp, repairMessage } from "../lib/share";

const STATUSES = ["received", "in progress", "awaiting parts", "completed", "delivered"];
const PAYMENTS = ["Unpaid", "Paid", "Partial"];

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function RepairsPage() {
  const t = useThemeTokens();
  const { settings } = useSettings();
  const labels = settings.labels;
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [repairs, setRepairs] = useState(() => db.getRepairs());
  const [expanded, setExpanded] = useState(null);
  // Today and this week open on arrival, same reasoning as Sales: that's
  // what anyone opening the page actually came to look at.
  const [openGroups, setOpenGroups] = useState(() => new Set(["today", "week"]));
  const { isAdmin } = useAuth();

  // Today first. This page had no summary at all, so the only way to find
  // out how many jobs were on the bench was to count the cards.
  const summary = repairsSummary(repairs);

  function refresh() {
    setRepairs(db.getRepairs());
  }

  const filtered = repairs.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.ticket?.toLowerCase().includes(q) ||
      r.customerName?.toLowerCase().includes(q) ||
      r.customerPhone?.includes(q) ||
      r.device?.toLowerCase().includes(q) ||
      r.problem?.toLowerCase().includes(q)
    );
  });
  // A match sitting in a shut group would be invisible -- searching drops
  // the grouping entirely rather than opening groups around whatever
  // matched.
  const isSearching = search.trim().length > 0;
  const groups = groupByPeriod(filtered);

  function toggleGroup(key) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleCompleted() {
    setShowModal(false);
    refresh();
  }

  function updateField(id, field, value) {
    db.updateRepair(id, { [field]: value });
    refresh();
  }

  function handleDelete(id) {
    db.deleteRepair(id);
    refresh();
  }

  function sendWhatsApp(repair) {
    openWhatsApp(repair.customerPhone, repairMessage(repair, settings));
  }

  function renderRepairCard(r) {
    const isOpen = expanded === r.id;
    return (
      <div key={r.id} className={`rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`font-bold text-sm ${t.textPrimary}`}>{r.ticket}</span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${t.pillBg}`}>
              {r.status}
            </span>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                r.paymentStatus === "Paid"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-600"
              }`}
            >
              {r.paymentStatus?.toLowerCase()}
            </span>
            {/* What the job comes to: labour plus whatever was fitted.
                The card showed a paid/unpaid pill and no number at
                all, so "unpaid" said nothing about how much.

                Just the one figure. The pill beside it already says
                whether it has been paid, so printing the same number
                twice -- "14,000 - 14,000 owed" -- was noise on every
                unpaid job, which is most of them. */}
            {repairTotal(r) > 0 && (
              <span
                className={`text-xs font-semibold tabular-nums ${
                  repairOwed(r) > 0 ? "text-red-500" : t.textSecondary
                }`}
              >
                {money(repairTotal(r), settings)}
                {r.paymentStatus === "Partial" && (
                  <span className={t.textMuted}> &middot; part paid</span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => generateRepairTicketPdf(r)} className={t.textSecondary} title={TICKET_ACTION}>
              <FileText className="w-[18px] h-[18px]" />
            </button>
            <button onClick={() => sendWhatsApp(r)} className="text-emerald-500" title="WhatsApp">
              <MessageCircle className="w-[18px] h-[18px]" />
            </button>
            <button onClick={() => handleDelete(r.id)} className="text-red-500" title="Delete">
              <Trash2 className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => setExpanded(isOpen ? null : r.id)}
              className={`${t.textMuted} transition-transform ${isOpen ? "rotate-90" : ""}`}
            >
              <ChevronRight className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        <div className={`mt-2 font-medium ${t.textPrimary}`}>
          {r.device} &mdash; {r.problem}
        </div>
        <div className={`text-sm mt-1 ${t.textMuted}`}>
          {r.customerName} &middot; {r.customerPhone} &middot; {formatTime(r.createdAt)}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className={`text-xs font-medium block mb-1.5 ${t.textPrimary}`}>{labels.ticketSingular} status</label>
            <select
              value={r.status}
              onChange={(e) => updateField(r.id, "status", e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={`text-xs font-medium block mb-1.5 ${t.textPrimary}`}>Payment</label>
            <select
              value={r.paymentStatus}
              onChange={(e) => updateField(r.id, "paymentStatus", e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            >
              {PAYMENTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isOpen && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm">
            <div className={t.textSecondary}>
              IMEI: <span className={t.textPrimary}>{r.imei || "N/A"}</span>
            </div>
            <div className={t.textSecondary}>
              Serial: <span className={t.textPrimary}>{r.serial || "N/A"}</span>
            </div>
            <div className={`col-span-2 ${t.textSecondary}`}>
              Notes: <span className={t.textPrimary}>{r.notes || "—"}</span>
            </div>
            <div className="col-span-2">
              <SignatureField
                value={r.signature}
                onChange={(signature) => updateField(r.id, "signature", signature)}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-8">
      <Topbar
        title={labels.navRepairs}
        subtitle={
          [
            `${summary.inToday} in today`,
            `${summary.open} still open`,
            summary.ready ? `${summary.ready} waiting to be collected` : null,
            // What the shop has not been paid for. Kept with whoever runs the
            // shop, like the stock value on the inventory page.
            isAdmin && summary.owed > 0 ? `${money(summary.owed, settings)} owed` : null,
          ]
            .filter(Boolean)
            .join(" \u00b7 ")
        }
        action={
          <div className="flex items-center gap-3">
            <button
              onClick={() => generateBlankRepairFormPdf()}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold ${t.pillBg}`}
            >
              <FileText className="w-4 h-4" /> Ticket
            </button>
            <button
              data-tour="new-repair"
              onClick={() => setShowModal(true)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold ${
                t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
              }`}
            >
              <Plus className="w-4 h-4" /> New {labels.ticketSingular}
            </button>
          </div>
        }
      />

      <div className={`flex items-center gap-2 rounded-full px-4 py-3 mb-6 ${t.cardBg}`}>
        <Search className={`w-4 h-4 ${t.textMuted}`} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ticket, customer, phone, ${labels.itemLabel.toLowerCase()} or ${labels.problemLabel.toLowerCase()}`}
          className="bg-transparent outline-none text-sm flex-1"
        />
      </div>

      {filtered.length === 0 ? (
        <div className={`rounded-2xl p-16 text-center ${t.cardBg}`}>
          <div className={`font-semibold ${t.textPrimary} mb-1`}>No {labels.ticketPlural.toLowerCase()} yet</div>
          <div className={`text-sm ${t.textMuted}`}>{labels.ticketPlural} will appear here</div>
        </div>
      ) : isSearching ? (
        <div className="td-stagger flex flex-col gap-3">{filtered.map(renderRepairCard)}</div>
      ) : (
        <div>
          {groups.map((g) => (
            <PeriodGroup
              key={g.key}
              label={g.label}
              count={g.items.length}
              open={openGroups.has(g.key)}
              onToggle={() => toggleGroup(g.key)}
            >
              {g.items.map(renderRepairCard)}
            </PeriodGroup>
          ))}
        </div>
      )}

      {showModal && <NewRepairModal onClose={() => setShowModal(false)} onCompleted={handleCompleted} />}
    </div>
  );
}
