import React from "react";
import { useTier } from "../lib/useTier";
import { useLicense } from "../lib/LicenseContext";
import { LockedButton } from "./UpgradeLock";

/**
 * Save-as-PDF, with three free tries for a shop that has not paid for it.
 *
 * receiptPdf is a paid capability, but a free shop that has never seen what
 * a saved PDF looks like has no way to judge whether it is worth paying for.
 * This is the one deliberate exception to the rest of the licence system's
 * rule that nothing a shop already has working ever gets taken away or
 * counted down -- see the note in LicenseContext.jsx. A free shop's sales,
 * repairs, and receipt PRINTING are untouched, forever; only this one paid
 * capability gets a taste, and the taste never un-saves a PDF already made --
 * once the three are spent this renders exactly like any other locked
 * control, the same LockedButton every other paid feature uses.
 */
export default function PdfSaveButton({ onSave, className, children, title }) {
  const { can } = useTier();
  const { pdfsRemaining, recordPdfSaved } = useLicense();
  const paid = can("receiptPdf");
  const trialLeft = pdfsRemaining > 0;

  if (!paid && !trialLeft) {
    return (
      <LockedButton feature="receiptPdf" title={title} onClick={() => {}} className={className}>
        {children}
      </LockedButton>
    );
  }

  return (
    <button
      type="button"
      title={paid ? title : `${title} — ${pdfsRemaining} free left`}
      onClick={() => {
        onSave();
        if (!paid) recordPdfSaved();
      }}
      className={className}
    >
      {children}
      {!paid && (
        <span className="ml-0.5 text-[10px] font-semibold opacity-70" aria-hidden="true">
          {pdfsRemaining}
        </span>
      )}
    </button>
  );
}
