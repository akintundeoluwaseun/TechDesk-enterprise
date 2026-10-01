import React, { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, User, Search } from "lucide-react";
import Topbar from "../components/Topbar";
import CustomerModal from "../components/CustomerModal";
import { useThemeTokens } from "../lib/ThemeContext";
import { useSettings } from "../lib/SettingsContext";
import { useAuth } from "../lib/AuthContext";
import { money } from "../lib/currency";
import { customerTotals, customersSummary, customerKey } from "@techdesk/core";
import { db } from "../lib/db";

export default function CustomersPage() {
  const t = useThemeTokens();
  const { settings } = useSettings();
  const { isAdmin } = useAuth();
  const [customers, setCustomers] = useState(() => db.getCustomers());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");

  // Built once for the whole list, not once per row: a shop with 400
  // customers and 4,000 sales would otherwise walk the sales list 400 times
  // to draw one screen.
  const totals = useMemo(
    () => customerTotals(db.getSales(), db.getRepairs()),
    [customers],
  );
  const summary = customersSummary(customers, totals);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q)
    );
  });

  function refresh() {
    setCustomers(db.getCustomers());
  }

  function handleSaved() {
    setShowModal(false);
    setEditing(null);
    refresh();
  }

  function handleDelete(id) {
    db.saveCustomers(db.getCustomers().filter((c) => c.id !== id));
    refresh();
  }

  return (
    <div className="flex-1 p-4 md:p-8">
      <Topbar
        title="Customers"
        subtitle={
          // This page said nothing at all. A shop could not tell how many
          // customers it had without scrolling to the bottom and counting.
          [
            `${customers.length} customer${customers.length === 1 ? "" : "s"}`,
            summary.newToday ? `${summary.newToday} new today` : null,
            isAdmin && summary.owed > 0
              ? `${money(summary.owed, settings)} owed by ${summary.owing}`
              : null,
          ]
            .filter(Boolean)
            .join(" \u00b7 ")
        }
        action={
          <button
            data-tour="new-customer"
            onClick={() => {
              setEditing(null);
              setShowModal(true);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold ${
              t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
            }`}
          >
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        }
      />

      <div className={`flex items-center gap-2 rounded-full px-4 py-3 mb-6 ${t.cardBg}`}>
        <Search className={`w-4 h-4 ${t.textMuted}`} />
        <input
          data-tour="page-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, phone, email or address"
          className="bg-transparent outline-none text-sm flex-1"
        />
      </div>

      {customers.length === 0 ? (
        <div className={`rounded-2xl p-16 text-center ${t.cardBg}`}>
          <div className={`font-semibold ${t.textPrimary} mb-1`}>No customers yet</div>
          <div className={`text-sm ${t.textMuted}`}>Customers will appear here</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`rounded-2xl p-16 text-center ${t.cardBg}`}>
          <div className={`font-semibold ${t.textPrimary} mb-1`}>No matching customers</div>
          <div className={`text-sm ${t.textMuted}`}>Try a different search</div>
        </div>
      ) : (
        <div className={`td-stagger rounded-2xl overflow-hidden ${t.cardBg}`}>
          {filtered.map((c, idx) => (
            <div
              key={c.id}
              className={`flex items-center justify-between px-6 py-4 ${
                idx !== filtered.length - 1 ? `border-b ${t.divider}` : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center ${
                    t.dark ? "bg-white/10" : "bg-black/5"
                  }`}
                >
                  <User className={`w-4 h-4 ${t.textSecondary}`} />
                </div>
                <div className="min-w-0">
                  <div className={`font-semibold ${t.textPrimary}`}>{c.name}</div>
                  <div className={`text-sm truncate ${t.textMuted}`}>
                    {[c.phone, c.email].filter(Boolean).join(" \u00b7 ")}
                  </div>
                  {/* What this customer has actually been worth. The row was
                      a name and a phone number, so the shop's best customer
                      and somebody who came in once looked identical. */}
                  {(() => {
                    const row = totals.get(customerKey(c));
                    if (!row) return null;
                    const visits = row.sales + row.repairs;
                    return (
                      <div className={`text-xs mt-0.5 tabular-nums ${t.textSecondary}`}>
                        {visits} visit{visits === 1 ? "" : "s"}
                        {" \u00b7 "}
                        {money(row.spent, settings)}
                        {row.owed > 0 && (
                          <span className="text-red-500"> &middot; {money(row.owed, settings)} owed</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0 pl-3">
                <button
                  onClick={() => {
                    setEditing(c);
                    setShowModal(true);
                  }}
                  className={t.textSecondary}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(c.id)} className="text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CustomerModal
          customer={editing}
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
