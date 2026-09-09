import React, { useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, Package, ChevronDown, FileSpreadsheet, AlertTriangle } from "lucide-react";
import Topbar from "../components/Topbar";
import ProductModal from "../components/ProductModal";
import { useThemeTokens } from "../lib/ThemeContext";
import { useAuth } from "../lib/AuthContext";
import { db } from "../lib/db";
import { rowsToCsv, downloadCsv } from "../lib/csv";

export default function InventoryPage() {
  const t = useThemeTokens();
  const { isAdmin } = useAuth();
  const [products, setProducts] = useState(() => db.getInventory());
  const [tab, setTab] = useState("in-stock"); // in-stock | sold-out | low-stock
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

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

  const filtered = products.filter((p) => {
    if (tab === "in-stock" && p.stock <= 0) return false;
    if (tab === "sold-out" && p.stock > 0) return false;
    if (tab === "low-stock" && !isLowStock(p)) return false;
    if (category !== "All" && p.category !== category) return false;
    if (search && !p.name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

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
      ["Name", "SKU", "Category", "Price", "Cost Price", "Stock", "Low Stock Threshold", "Suggested Reorder Qty"],
      ...filtered.map((p) => [
        p.name,
        p.sku || "",
        p.category || "",
        p.price,
        p.costPrice || "",
        p.stock,
        p.lowStockThreshold ?? 5,
        suggestedReorder(p),
      ]),
    ];
    const filenameTag = tab === "low-stock" ? "restock-list" : "inventory";
    downloadCsv(`techdesk-${filenameTag}-${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsv(rows));
  }

  return (
    <div className="flex-1 p-8">
      <Topbar
        title="Inventory"
        subtitle={
          isAdmin
            ? `${inStockCount} in stock \u00b7 ${soldOutCount} sold out \u00b7 Total value \u20A6${products
                .reduce((sum, p) => sum + Number(p.price || 0) * Number(p.stock || 0), 0)
                .toLocaleString()}`
            : `${inStockCount} in stock \u00b7 ${soldOutCount} sold out`
        }
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold ${t.pillBg}`}
            >
              <FileSpreadsheet className="w-4 h-4" /> {tab === "low-stock" ? "Export restock list" : "Export CSV"}
            </button>
            <button
              onClick={() => {
                setEditingProduct(null);
                setShowModal(true);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold ${
                t.dark ? "bg-white text-black" : "bg-slate-900 text-white"
              }`}
            >
              <Plus className="w-4 h-4" /> Add Product
            </button>
          </div>
        }
      />

      <div className={`flex rounded-xl p-1 mb-5 w-full max-w-md ${t.insetBg}`}>
        <button
          onClick={() => setTab("in-stock")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "in-stock"
              ? t.dark
                ? "bg-[#1e222a] shadow-[2px_2px_4px_#14171d,-2px_-2px_4px_#282d37] text-white"
                : "bg-[#e9ecf1] shadow-[2px_2px_4px_#c8cdd4,-2px_-2px_4px_#ffffff] text-slate-800"
              : t.textSecondary
          }`}
        >
          <Package className="w-4 h-4" /> In Stock ({inStockCount})
        </button>
        <button
          onClick={() => setTab("sold-out")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "sold-out"
              ? t.dark
                ? "bg-[#1e222a] shadow-[2px_2px_4px_#14171d,-2px_-2px_4px_#282d37] text-white"
                : "bg-[#e9ecf1] shadow-[2px_2px_4px_#c8cdd4,-2px_-2px_4px_#ffffff] text-slate-800"
              : t.textSecondary
          }`}
        >
          <Package className="w-4 h-4" /> Sold Out ({soldOutCount})
        </button>
        <button
          onClick={() => setTab("low-stock")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "low-stock"
              ? t.dark
                ? "bg-[#1e222a] shadow-[2px_2px_4px_#14171d,-2px_-2px_4px_#282d37] text-white"
                : "bg-[#e9ecf1] shadow-[2px_2px_4px_#c8cdd4,-2px_-2px_4px_#ffffff] text-slate-800"
              : t.textSecondary
          }`}
        >
          <AlertTriangle className="w-4 h-4" /> Low Stock ({lowStockCount})
        </button>
      </div>

      <div className={`flex items-center gap-2 rounded-full px-4 py-3 mb-4 ${t.cardBg}`}>
        <Search className={`w-4 h-4 ${t.textMuted}`} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products..."
          className="bg-transparent outline-none text-sm flex-1"
        />
      </div>

      <div className="relative mb-6">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={`w-full rounded-xl px-4 py-3 text-sm outline-none appearance-none ${t.inputBg}`}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <ChevronDown className={`w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none ${t.textMuted}`} />
      </div>

      <div className={`rounded-2xl overflow-hidden ${t.cardBg}`}>
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
              </div>
              <div className={t.textPrimary}>&#8358;{Number(p.price).toLocaleString()}</div>
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
