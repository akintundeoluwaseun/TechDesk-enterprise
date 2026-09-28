import React, { useState } from "react";
import { Plus, Search, MessageCircle, Printer, FileText, Receipt, Pencil, Trash2 } from "lucide-react";
import Topbar from "../components/Topbar";
import NewSaleModal from "../components/NewSaleModal";
import PrintSizeModal from "../components/PrintSizeModal";
import { useThemeTokens } from "../lib/ThemeContext";
import { useAuth } from "../lib/AuthContext";
import { useSettings } from "../lib/SettingsContext";
import { db } from "../lib/db";
import { salesSummary } from "@techdesk/core";
import { generateInvoicePdf } from "../lib/generateInvoicePdf";
import { generateThermalReceiptPdf } from "../lib/generateThermalReceipt";
import { openWhatsApp, saleMessage } from "../lib/share";
import { LockedButton } from "../components/UpgradeLock";
import PdfSaveButton from "../components/PdfSaveButton";
import { money } from "../lib/currency";

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
  // The sale waiting on a paper size, or null. Print asks rather than
  // assuming A4: a counter with a thermal roll wants the other one.
  const [printing, setPrinting] = useState(null);
  const [editingSale, setEditingSale] = useState(null);
  const [search, setSearch] = useState("");
  const [sales, setSales] = useState(() => db.getSales());

  // Today first. The line here said "340 total transactions", which is a
  // number that only goes up and tells a shop nothing about their day.
  const summary = salesSummary(sales);

  const filtered = sales.filter(
    (s) =>
      s.invoice?.toLowerCase().includes(search.toLowerCase()) ||
      s.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  function refresh() {
    setSales(db.getSales());
  }

  function handleCompleted() {
    setShowModal(false);
    setEditingSale(null);
    refresh();
  }

  function updateStatus(id, field, value) {
    db.updateSale(id, { [field]: value });
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
  }

  function sendWhatsApp(sale) {
    openWhatsApp(sale.customerPhone, saleMessage(sale, settings));
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
            onClick={() => {
              setEditingSale(null);
              setShowModal(true);
            }}
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
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by invoice or customer..."
          className="bg-transparent outline-none text-sm flex-1"
        />
      </div>

      {filtered.length === 0 ? (
        <div className={`rounded-2xl p-16 text-center ${t.cardBg}`}>
          <div className={`font-semibold ${t.textPrimary} mb-1`}>No sales yet</div>
          <div className={`text-sm ${t.textMuted}`}>Sales will appear here</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((sale) => (
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
                <span
                  className={`text-xs font-semibold px-3 py-1 rounded-full ${
                    sale.paymentStatus === "Paid"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {sale.paymentStatus}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <select
                  value={sale.paymentStatus}
                  onChange={(e) => updateStatus(sale.id, "paymentStatus", e.target.value)}
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
              <div className="flex items-center gap-2 flex-wrap">
                {/* Print stays free: a shop that cannot hand a customer a
                    receipt is not a shop. Saving the file and sending it are
                    what Business is for -- Save A4/58mm give a free shop
                    three tries at that first (PdfSaveButton), WhatsApp does
                    not. Every one of them stays visible even locked -- a
                    button that vanishes reads as a bug, and a free shop
                    never discovers the paid version does it. */}
                <LockedButton
                  feature="receiptShare"
                  title="WhatsApp"
                  onClick={() => sendWhatsApp(sale)}
                  className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium ${t.pillBg}`}
                >
                  <MessageCircle className="w-4 h-4 shrink-0" /> WhatsApp
                </LockedButton>
                <button
                  onClick={() => setPrinting(sale)}
                  className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium ${t.pillBg}`}
                >
                  <Printer className="w-4 h-4 shrink-0" /> Print
                </button>
                <PdfSaveButton
                  title="Save A4"
                  onSave={() => generateInvoicePdf(sale)}
                  className={`flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium ${t.pillBg}`}
                >
                  <FileText className="w-4 h-4 shrink-0" /> Save A4
                </PdfSaveButton>
                <PdfSaveButton
                  title="Save 58mm"
                  onSave={() => generateThermalReceiptPdf(sale)}
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
                <button
                  onClick={() => handleDelete(sale)}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-medium text-red-500 bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 shrink-0" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
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
