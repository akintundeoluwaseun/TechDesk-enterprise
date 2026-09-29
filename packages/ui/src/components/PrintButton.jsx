import React from "react";
import { Lock } from "lucide-react";
import { useTier } from "../lib/useTier";
import { useOutputAllowance } from "../lib/outputAllowance";
import { openUpgrade } from "../lib/upgradeModal";

/**
 * Print, with the free plan's ten a month showing on the button. A paid shop
 * sees an ordinary button; a free shop sees how many are left, and once
 * they're used, a lock that opens the upgrade screen instead of a print that
 * silently does nothing.
 */
export default function PrintButton({ onPrint, className, children, title = "Print" }) {
  const { can } = useTier();
  const { printsLeft } = useOutputAllowance();
  const free = !can("receiptPdf");

  if (free && printsLeft <= 0) {
    return (
      <button
        type="button"
        className={`${className} opacity-60`}
        title="This month's 10 free prints are used. Business prints without limits."
        onClick={(e) => {
          e.preventDefault();
          openUpgrade();
        }}
      >
        <Lock size={14} /> {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={free ? `${title} — ${printsLeft} free this month, stamped "TechDesk"` : title}
      onClick={onPrint}
    >
      {children}
      {free && (
        <span className="ml-0.5 text-[10px] font-semibold opacity-70" aria-hidden="true">
          {printsLeft}
        </span>
      )}
    </button>
  );
}
