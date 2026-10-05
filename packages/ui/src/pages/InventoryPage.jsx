import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, Pencil, Trash2, ChevronDown, FileSpreadsheet, PackageSearch } from "lucide-react";
import Topbar from "../components/Topbar";
import { openRestock } from "../lib/restock";
import ProductModal from "../components/ProductModal";
import { useThemeTokens } from "../lib/ThemeContext";
import { useAuth } from "../lib/AuthContext";
import { db } from "../lib/db";
import { rowsToCsv, downloadCsv } from "../lib/csv";
import { money } from "../lib/currency";
import { useSettings } from "../lib/SettingsContext";

export default function InventoryPage() {
  const t = useThemeTokens();
  const { settings } = useSettings();
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState(() => db.getInventory());
  const [tab, setTab] = useState("in-stock"); // in-stock | sold-out | low-stock
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("recent");
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  // ?new=1 (from the assistant's quick actions) opens the form straight away,
  // whether or not this page was already showing.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get("new") === "1") {
      setParams({}, { replace: true });
      setEditingProduct(null);
      setShowModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);


  function refresh() {
    setProducts(db.getInventory());
  }

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return ["All", ...Array.from(set)];
  }, [products]);

  function isLowStock(p) {
    return p.stock > 0 && p.stock <= (p.lowStockThreshold ?? 5);
  }

  function suggestedReorder(p) {
    if (!isLowStock(p)) return 0;
    const threshold = p.lowStockThreshold ?? 5;
    return Math.max(1, threshold * 2 - p.stock);
  }

  const inStockCount = products.filter((p) => p.stock > 0).length;
  const soldOutCount = products.filter((p) => p.stock <= 0).length;
  const lowStockCount = products.filter(isLowStock).length;

  // How many THINGS are on the shelf, as opposed to how many lines the list
  // has. A shop with 12 products and 4 of each has 48 items in it, and the
  // page only ever said 12 -- which is the number that matters least to
  // somebody counting stock.
  //
  // Negative stock is clamped out of the totals. It happens (a sale rung up
  // twice, a count corrected later), and letting it subtract would quietly
  // report less stock, and less value, than the shop actually has.
  function units(p) {
    return Math.max(0, Number(p.stock) || 0);
  }

  function valueOf(p) {
    return (Number(p.price) || 0) * units(p);
  }

  const totalUnits = products.reduce((n, p) => n + units(p), 0);
  const totalValue = products.reduce((n, p) => n + valueOf(p), 0);

  const SORTS = {
    recent: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
    "name-asc": (a, b) => (a.name || "").localeCompare(b.name || ""),
    "name-desc": (a, b) => (b.name || "").localeCompare(a.name || ""),
    "price-desc": (a, b) => Number(b.price || 0) - Number(a.price || 0),
    "price-asc": (a, b) => Number(a.price || 0) - Number(b.price || 0),
    "stock-asc": (a, b) => Number(a.stock || 0) - Number(b.stock || 0),
    "stock-desc": (a, b) => Number(b.stock || 0) - Number(a.stock || 0),
  };

  const filtered = products
    .filter((p) => {
      if (tab === "in-stock" && p.stock <= 0) return false;
      if (tab === "sold-out" && p.stock > 0) return false;
      if (tab === "low-stock" && !isLowStock(p)) return false;
      if (category !== "All" && p.category !== category) return false;
      if (search && !p.name?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort(SORTS[sort] || SORTS.recent);

  // The same two numbers for what is actually on screen. A shop filtered to
  // one category wants that category's count and value, not the whole shop's.
  const shownUnits = filtered.reduce((n, p) => n + units(p), 0);
  const shownValue = filtered.reduce((n, p) => n + valueOf(p), 0);

  function handleSaved() {
    setShowModal(false);
    setEditingProduct(null);
    refresh();
  }

  function handleDelete(id) {
    db.deleteInventoryItem(id);
    refresh();
  }

  function handleExportCsv() {
    const rows = [
      ["Name", "SKU", "Category", "Price", "Cost Price", "Stock", "Stock Value", "Low Stock Threshold", "Suggested Reorder Qty"],
      ...filtered.map((p) => [
        p.name,
        p.sku || "",
        p.category || "",
        p.price,
        p.costPrice || "",
        p.stock,
        valueOf(p),
        p.lowStockThreshold ?? 5,
        suggestedReorder(p),
      ]),
      // The totals the screen shows, so the file answers the same question
      // without the shop having to build the column themselves.
      ["", "", "", "", "", shownUnits, shownValue, "", ""],
    ];
    const filenameTag = tab === "low-stock" ? "restock-list" : "inventory";
    downloadCsv(`techdesk-${filenameTag}-${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsv(rows));
  }

  return (
    <div className="flex-1 p-4 md:p-8">
      <Topbar
        title="Inventory"
        subtitle={
          // Products, then items, then what they are worth. "12 in stock"
          // read as twelve things; it meant twelve lines in the list.
          [
            `${inStockCount} product${inStockCount === 1 ? "" : "s"}`,
            `${totalUnits} item${totalUnits === 1 ? "" : "s"} on the shelf`,
            soldOutCount ? `${soldOutCount} sold out` : null,
            // The shop-wide total stays with whoever runs the shop. Each
            // line's own value is shown to everyone below, because price and
            // stock are both already on the screen next to each other.
            isAdmin ? `Total value ${money(totalValue, settings)}` : null,
          ]
            .filter(Boolean)
            .join(" \u00b7 ")
        }
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={openRestock}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold ${t.pillBg}`}
            >
              <PackageSearch className="w-4 h-4" /> Restock planner
            </button>
            <button
              data-tour="page-export"
              onClick={handleExportCsv}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold ${t.pillBg}`}
            >
              <FileSpreadsheet className="w-4 h-4" /> {tab === "low-stock" ? "Export restock list" : "Export CSV"}
            </button>
            <button
              data-tour="new-product"
              onClick={() => {
                setEditingProduct(null);
                setShowModal(true);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold ${
                t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
              }`}
            >
              <Plus className="w-4 h-4" /> Add Product
            </button>
          </div>
        }
      />

      <div className={`flex items-center gap-2 rounded-full px-4 py-3 mb-4 ${t.cardBg}`}>
        <Search className={`w-4 h-4 ${t.textMuted}`} />
        <input
          data-tour="page-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products..."
          className="bg-transparent outline-none text-sm flex-1"
        />
      </div>

      {/* Stock status, category and sort together -- the counts that used to
          sit on the old tab strip are kept in the option labels. */}
      <div data-tour="inventory-filters" className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="relative">
          <select
            value={tab}
            onChange={(e) => setTab(e.target.value)}
            className={`w-full rounded-xl px-4 py-3 text-sm outline-none appearance-none ${t.inputBg}`}
          >
            <option value="all">All stock ({products.length})</option>
            <option value="in-stock">In stock ({inStockCount})</option>
            <option value="sold-out">Sold out ({soldOutCount})</option>
            <option value="low-stock">Low stock ({lowStockCount})</option>
          </select>
          <ChevronDown className={`w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none ${t.textMuted}`} />
        </div>

        <div className="relative">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`w-full rounded-xl px-4 py-3 text-sm outline-none appearance-none ${t.inputBg}`}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "All" ? "All categories" : c}
              </option>
            ))}
          </select>
          <ChevronDown className={`w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none ${t.textMuted}`} />
        </div>

        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className={`w-full rounded-xl px-4 py-3 text-sm outline-none appearance-none ${t.inputBg}`}
          >
            <option value="recent">Newest first</option>
            <option value="name-asc">Name (A–Z)</option>
            <option value="name-desc">Name (Z–A)</option>
            <option value="price-desc">Price (high to low)</option>
            <option value="price-asc">Price (low to high)</option>
            <option value="stock-asc">Stock (low to high)</option>
            <option value="stock-desc">Stock (high to low)</option>
          </select>
          <ChevronDown className={`w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none ${t.textMuted}`} />
        </div>
      </div>

      <div className={`td-stagger rounded-2xl overflow-hidden ${t.cardBg}`}>
        <div
          className={`grid ${
            tab === "low-stock" ? "grid-cols-[2fr_1fr_1fr_1fr_1fr]" : "grid-cols-[2fr_1fr_1fr_1fr]"
          } px-6 py-4 text-sm font-semibold ${t.textSecondary} border-b ${t.divider}`}
        >
          <span>Product</span>
          <span>Price</span>
          <span>Stock</span>
          {tab === "low-stock" && <span>Suggested Reorder</span>}
          <span className="text-right">Actions</span>
        </div>

        {filtered.length === 0 ? (
          <div className={`p-16 text-center ${t.textMuted}`}>No products found</div>
        ) : (
          filtered.map((p) => (
            <div
              key={p.id}
              className={`grid ${
                tab === "low-stock" ? "grid-cols-[2fr_1fr_1fr_1fr_1fr]" : "grid-cols-[2fr_1fr_1fr_1fr]"
              } items-center px-6 py-4 text-sm border-b last:border-0 ${t.divider}`}
            >
              <div>
                <div className={`font-medium ${t.textPrimary}`}>{p.name}</div>
                <div className={`text-xs ${t.textMuted}`}>
                  {p.sku || "\u2014"} &middot; {p.category}
                </div>
                {/* Somebody else's shelf, visible here because that is the
                    point of syncing -- but never selectable in a sale or a
                    repair, because ringing it up would draw down stock that
                    physically sits with them, not here. */}
                {p.sharedFrom && (
                  <div className={`text-xs mt-0.5 ${t.textMuted}`}>Synced from {p.sharedFrom}</div>
                )}
              </div>
              {/* The price of one, and then what is actually on the shelf.
                  This column showed the unit price alone, so a shop looking
                  at four screens at 8,000 each had to do the multiplication
                  in their head, on every line, to find out what their stock
                  was worth. It is kept as two lines rather than a new column
                  because this table is read on a phone. */}
              <div>
                <div className={t.textPrimary}>{money(Number(p.price), settings)}</div>
                {units(p) > 0 && (
                  <div className={`text-xs leading-tight tabular-nums ${t.textMuted}`}>
                    &times;{units(p)} = {money(valueOf(p), settings)}
                  </div>
                )}
              </div>
              <div className={p.stock <= (p.lowStockThreshold || 5) ? "text-orange-500 font-medium" : t.textPrimary}>
                {p.stock}
              </div>
              {tab === "low-stock" && (
                <div className="font-medium text-orange-500">+{suggestedReorder(p)}</div>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setEditingProduct(p);
                    setShowModal(true);
                  }}
                  className={t.textSecondary}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(p.id)} className="text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}

        {/* What is on screen, added up. The header counts the whole shop;
            this follows the filter, so a shop looking at one category can see
            what that category holds without exporting the CSV.

            Not on the grid above. A money total does not fit in a 1fr column
            on a 390px phone -- laid out that way it printed straight through
            the column beside it and read as one number. */}
        {filtered.length > 0 && (
          <div
            className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-4 text-sm font-semibold border-t ${t.divider} ${t.textPrimary}`}
          >
            <span>
              {filtered.length === products.length ? "All products" : `${filtered.length} shown`}
            </span>
            <span className="tabular-nums">
              {shownUnits} item{shownUnits === 1 ? "" : "s"}
              {isAdmin && <> &middot; {money(shownValue, settings)}</>}
            </span>
          </div>
        )}
      </div>

      {showModal && (
        <ProductModal
          product={editingProduct}
          onClose={() => {
            setShowModal(false);
            setEditingProduct(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
