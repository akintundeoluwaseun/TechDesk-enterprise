import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, MessageCircle, Printer, FileText, Receipt, Pencil, Trash2, Undo2, Lock } from "lucide-react";
import Topbar from "../components/Topbar";
import NewSaleModal from "../components/NewSaleModal";
import PrintSizeModal from "../components/PrintSizeModal";
import PeriodGroup from "../components/PeriodGroup";
import ReturnModal from "../components/ReturnModal";
import { useThemeTokens } from "../lib/ThemeContext";
import { useAuth } from "../lib/AuthContext";
import { useSettings } from "../lib/SettingsContext";
import { db } from "../lib/db";
import { salesSummary, groupByPeriod, visibleSales, salePaymentStatus, saleOwed } from "@techdesk/core";
import UnpaidReceiptModal from "../components/UnpaidReceiptModal";
import { generateInvoicePdf } from "../lib/generateInvoicePdf";
import { generateThermalReceiptPdf } from "../lib/generateThermalReceipt";
import { openWhatsApp, saleMessage } from "../lib/share";
import { LockedButton } from "../components/UpgradeLock";
import PdfSaveButton from "../components/PdfSaveButton";
import PrintButton from "../components/PrintButton";
import { money } from "../lib/currency";
import { toast } from "../lib/toast";
import { requestTour, wantsSaleSetup, markSaleSetupDone } from "../lib/setupTours";

const PAYMENT_STATUSES = ["Paid", "Pending", "Partial"];
const PAYMENT_METHODS = ["Cash", "Bank Transfer", "POS", "Transfer + Cash"];

function formatDate(iso) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

export default function SalesPage() {
  const t = useThemeTokens();
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings();
  const [showModal, setShowModal] = useState(false);

  // The first sale on a shop with no name or signature on its receipts yet
  // goes by Settings first -- once. The tour brings them back here with
  // ?new=1, and the sale they were starting opens.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get("new") === "1") {
      setParams({}, { replace: true });
      setShowModal(true);
    }
    // On params, not just on mount: the assistant's "New sale" can arrive
    // while this page is already open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  function startSale() {
    setEditingSale(null);
    if (wantsSaleSetup(settings)) {
      markSaleSetupDone();
      requestTour("sale-setup");
      return;
    }
    setShowModal(true);
  }
  // The sale waiting on a paper size, or null. Print asks rather than
  // assuming A4: a counter with a thermal roll wants the other one.
  const [printing, setPrinting] = useState(null);
  // { sale, action, run } -- the receipt waiting on "is this really settled?"
  const [unpaid, setUnpaid] = useState(null);
  const [editingSale, setEditingSale] = useState(null);
  const [search, setSearch] = useState("");
  const [sales, setSales] = useState(() => db.getSales());
  // Today and this week open on arrival -- that's what anyone opening the
  // page actually came to look at. This month and older stay shut until
  // asked for, rather than a long scroll of cards from three months ago
  // sitting open above nothing.
  // Stored as the groups the shop has flipped from how they start, so the
  // newest group can start open even when it is "This Month" -- a quiet week
  // otherwise opened on a page of shut headers that looked empty.
  const [flippedGroups, setFlippedGroups] = useState(() => new Set());
  const [returning, setReturning] = useState(null);

  // Today first. The line here said "340 total transactions", which is a
  // number that only goes up and tells a shop nothing about their day.
  const summary = salesSummary(sales);

  // A day's worth, for anyone but the owner -- see visibleSales for why.
  const visible = visibleSales(sales, { isAdmin });
  const hiddenCount = sales.length - visible.length;

  const filtered = visible.filter(
    (s) =>
      s.invoice?.toLowerCase().includes(search.toLowerCase()) ||
      s.customerName?.toLowerCase().includes(search.toLowerCase())
  );
  // A match sitting in a shut group would be invisible -- searching drops
  // the grouping entirely rather than opening groups around whatever
  // matched.
  const isSearching = search.trim().length > 0;
  const groups = groupByPeriod(filtered);

  const startsOpen = (key, index) => key === "today" || key === "week" || index === 0;

  function toggleGroup(key) {
    setFlippedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function refresh() {
    setSales(db.getSales());
  }

  function handleCompleted(saved) {
    const wasEdit = Boolean(editingSale);
    setShowModal(false);
    setEditingSale(null);
    refresh();
    if (!saved) return;
    // A new sale is the moment the app exists for -- it gets confetti. An
    // edit is housekeeping, and gets a plain confirmation.
    toast(
      wasEdit
        ? { title: "Sale updated", message: saved.invoice }
        : { title: "Sale saved", message: `${saved.invoice} \u00b7 ${money(Number(saved.total), settings)}`, celebrate: true }
    );
  }

  /**
   * Every way a receipt leaves the shop goes through here first.
   *
   * Print, Save A4, Save 58mm and WhatsApp are four buttons but one act: the
   * customer ends up holding the shop's word that the sale is settled. So the
   * check belongs on the act, not on the one button that happens to say
   * "Print" -- guarding that one and leaving the other three open would just
   * teach a shop to use the other three.
   *
   * Paid sales are untouched. This is the overwhelming majority of receipts,
   * and a confirm on every single one is the fastest way to train a shop to
   * dismiss it without reading.
   */
  function withPaidCheck(sale, action, run) {
    if (salePaymentStatus(sale) === "Paid") return run();
    setUnpaid({ sale, action, run });
  }

  function updateStatus(id, field, value) {
    db.updateSale(id, { [field]: value });
    refresh();
  }

  /**
   * The payment dropdown, which now has to move the money as well as the word.
   *
   * The badge beside it reads the amount (salePaymentStatus), so writing only
   * the word would be a control that visibly does nothing: pick "Paid" on a
   * sale with nothing recorded and the badge says Paid -- that case is kept,
   * it is how a shop records "settled, but not in cash" -- but pick "Pending"
   * on a sale already paid in full and the badge would snap straight back.
   *
   * So the choice writes the amount it implies. "Paid" fills it to the total,
   * "Pending" empties it. "Partial" leaves whatever is there alone: the shop
   * is saying some of it came in, and only they know how much.
   */
  function updatePaymentStatus(sale, value) {
    const total = Number(sale.total) || 0;
    const patch = { paymentStatus: value };
    if (value === "Paid") patch.amountPaid = total;
    else if (value === "Pending") patch.amountPaid = 0;
    db.updateSale(sale.id, patch);
    refresh();
  }

  function handleDelete(sale) {
    db.deleteSale(sale.id);
    db.logActivity({
      type: "sale",
      message: `Sale ${sale.invoice} deleted (${sale.customerName || "Walk-in"}, ${money(Number(sale.total), settings)})`,
      refId: sale.id,
      actor: user?.name,
    });
    refresh();
    toast({ title: "Sale deleted", message: sale.invoice, tone: "danger" });
  }

  function sendWhatsApp(sale) {
    openWhatsApp(sale.customerPhone, saleMessage(sale, settings));
  }

  function renderSaleCard(sale) {
    return (
      <div key={sale.id} className={`rounded-2xl p-4 ${t.cardBg}`}>
        <div className="flex items-center justify-between mb-1.5">
          <span className={`font-bold text-sm tracking-wide ${t.textPrimary}`}>{sale.invoice}</span>
          <span className={`text-xs ${t.textMuted}`}>{formatDate(sale.createdAt)}</span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className={`font-semibold text-sm ${t.textPrimary}`}>
            {sale.customerName?.toUpperCase()}
            {sale.customerPhone && <span className={`font-normal ${t.textMuted}`}> &middot; {sale.customerPhone}</span>}
          </span>
          <span className={`text-xs ${t.textMuted}`}>{sale.items.length} item(s)</span>
        </div>

        <div className={`border-t ${t.divider} pt-2 mb-2`}>
          {sale.items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-sm mb-0.5">
              <span className={t.textSecondary}>
                {item.name} &times; {item.qty}
              </span>
              <span className={`font-medium ${t.textPrimary}`}>
                {money((item.price * item.qty), settings)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-2">
          <span className={`text-lg font-bold ${t.textPrimary}`}>
            {money(sale.total, settings)}
          </span>
          {/* What the money says, not what was written down beside it when
              the sale was saved. See salePaymentStatus. */}
          <span
            className={`text-xs font-semibold px-3 py-1 rounded-full ${
              salePaymentStatus(sale) === "Paid"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {salePaymentStatus(sale)}
          </span>
        </div>

        <div data-tour="sale-status" className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <select
            value={salePaymentStatus(sale)}
            onChange={(e) => updatePaymentStatus(sale, e.target.value)}
            className={`w-full rounded-lg px-3 py-1.5 text-xs outline-none ${t.inputBg}`}
          >
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={sale.paymentMethod}
            onChange={(e) => updateStatus(sale.id, "paymentMethod", e.target.value)}
            className={`w-full rounded-lg px-3 py-1.5 text-xs outline-none ${t.inputBg}`}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Labelled, and wrapping rather than shrinking. Five unlabelled
            circles the size of a fingertip is a guessing game, and the
            two that send a customer their receipt looked the same as
            the one that deletes the sale. */}
        <div data-tour="sale-actions" className="flex items-center gap-2 flex-wrap">
          {/* Print stays on the free plan -- a shop that cannot hand a
              customer a receipt is not a shop -- ten a month, stamped
              "TechDesk" (PrintButton). Saving the file and sending it are
              what Business is for -- Save A4/58mm give a free shop three
              clean saves a month (PdfSaveButton), WhatsApp does not. Every one of them stays visible even locked -- a
              button that vanishes reads as a bug, and a free shop
              never discovers the paid version does it. */}
          <LockedButton
            feature="receiptShare"
            title="WhatsApp"
            onClick={() => withPaidCheck(sale, "send", () => sendWhatsApp(sale))}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium ${t.pillBg}`}
          >
            <MessageCircle className="w-4 h-4 shrink-0" /> WhatsApp
          </LockedButton>
          <PrintButton
            onPrint={() => withPaidCheck(sale, "print", () => setPrinting(sale))}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium ${t.pillBg}`}
          >
            <Printer className="w-4 h-4 shrink-0" /> Print
          </PrintButton>
          <PdfSaveButton
            title="Save A4"
            onSave={() => withPaidCheck(sale, "print", () => generateInvoicePdf(sale))}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium ${t.pillBg}`}
          >
            <FileText className="w-4 h-4 shrink-0" /> Save A4
          </PdfSaveButton>
          <PdfSaveButton
            title="Save 58mm"
            onSave={() => withPaidCheck(sale, "print", () => generateThermalReceiptPdf(sale))}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium ${t.pillBg}`}
          >
            <Receipt className="w-4 h-4 shrink-0" /> 58mm
          </PdfSaveButton>
          <button
            onClick={() => {
              setEditingSale(sale);
              setShowModal(true);
            }}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium ${t.pillBg}`}
          >
            <Pencil className="w-4 h-4 shrink-0" /> Edit
          </button>
          {(sale.items || []).length > 0 && (
            <button
              onClick={() => setReturning(sale)}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium ${t.pillBg}`}
            >
              <Undo2 className="w-4 h-4 shrink-0" /> Return
            </button>
          )}
          <button
            onClick={() => handleDelete(sale)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium text-red-500 bg-red-500/10"
          >
            <Trash2 className="w-4 h-4 shrink-0" /> Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-8">
      <Topbar
        title="Sales"
        subtitle={
          // "340 total transactions" is true and is not what anybody opens
          // the app to find out. Today leads; the running total follows it.
          [
            `${summary.today} sale${summary.today === 1 ? "" : "s"} today`,
            isAdmin ? `${money(summary.todayTotal, settings)} today` : null,
            `${sales.length} all time`,
          ]
            .filter(Boolean)
            .join(" \u00b7 ")
        }
        action={
          <button
            data-tour="new-sale"
            onClick={startSale}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold ${
              t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
            }`}
          >
            <Plus className="w-4 h-4" /> New Sale
          </button>
        }
      />

      <div className={`flex items-center gap-2 rounded-full px-4 py-3 mb-6 ${t.cardBg}`}>
        <Search className={`w-4 h-4 ${t.textMuted}`} />
        <input
          data-tour="page-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by invoice or customer..."
          className="bg-transparent outline-none text-sm flex-1"
        />
      </div>

      {filtered.length === 0 ? (
        <div className={`rounded-2xl p-16 text-center ${t.cardBg}`}>
          <div className={`font-semibold ${t.textPrimary} mb-1`}>
            {hiddenCount > 0 ? "Nothing from today" : "No sales yet"}
          </div>
          <div className={`text-sm ${t.textMuted}`}>
            {hiddenCount > 0
              ? "Today's sales show here. Older ones are kept, and the owner can see them."
              : "Sales will appear here"}
          </div>
        </div>
      ) : isSearching ? (
        <div className="td-stagger flex flex-col gap-3">{filtered.map(renderSaleCard)}</div>
      ) : (
        <div>
          {groups.map((g, i) => (
            <PeriodGroup
              key={g.key}
              label={g.label}
              count={g.items.length}
              open={startsOpen(g.key, i) !== flippedGroups.has(g.key)}
              onToggle={() => toggleGroup(g.key)}
            >
              {g.items.map(renderSaleCard)}
            </PeriodGroup>
          ))}
        </div>
      )}

      {hiddenCount > 0 && (
        <p className={`flex items-center justify-center gap-2 mt-5 text-xs ${t.textMuted}`}>
          <Lock className="w-3.5 h-3.5 shrink-0" />
          {hiddenCount} older sale{hiddenCount === 1 ? "" : "s"} {hiddenCount === 1 ? "is" : "are"} kept
          for the owner. Nothing is lost.
        </p>
      )}

      {returning && (
        <ReturnModal
          sale={returning}
          onClose={() => setReturning(null)}
          onDone={() => setSales(db.getSales())}
        />
      )}
      {unpaid && (
        <UnpaidReceiptModal
          status={salePaymentStatus(unpaid.sale)}
          owed={saleOwed(unpaid.sale)}
          action={unpaid.action}
          onClose={() => setUnpaid(null)}
          onConfirm={() => {
            const go = unpaid.run;
            setUnpaid(null);
            go();
          }}
        />
      )}
      {printing && (
        <PrintSizeModal
          title={`Print ${printing.invoice || "receipt"}`}
          onClose={() => setPrinting(null)}
          onPick={(size) => {
            const sale = printing;
            setPrinting(null);
            if (size === "58mm") generateThermalReceiptPdf(sale, { print: true });
            else generateInvoicePdf(sale, { print: true });
          }}
        />
      )}

      {showModal && (
        <NewSaleModal
          sale={editingSale}
          onClose={() => {
            setShowModal(false);
            setEditingSale(null);
          }}
          onCompleted={handleCompleted}
        />
      )}
    </div>
  );
}
