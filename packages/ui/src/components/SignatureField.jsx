import React, { useState } from "react";
import { PenLine, X } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import SignaturePad from "./SignaturePad";

/**
 * Where a repair's customer signature lives in a form -- a thumbnail and a
 * way to change it once signed, or a button to open the pad when there is
 * none yet. `value` is a PNG data URI or null/undefined; `onChange` gets the
 * new one, or null when it is removed.
 */
export default function SignatureField({ value, onChange, label = "Customer signature" }) {
  const t = useThemeTokens();
  const [open, setOpen] = useState(false);

  return (
    <div>
      <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>{label}</label>
      {value ? (
        <div className={`flex items-center gap-3 rounded-xl p-3 ${t.insetBg}`}>
          <img src={value} alt="Customer signature" className="h-12 w-28 object-contain rounded bg-white" />
          <button type="button" onClick={() => setOpen(true)} className={`text-sm font-medium ${t.textSecondary}`}>
            Change
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-auto text-red-500"
            aria-label="Remove signature"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium ${t.pillBg}`}
        >
          <PenLine className="w-4 h-4" /> Tap to sign
        </button>
      )}
      {open && (
        <SignaturePad
          onSave={(dataUrl) => {
            onChange(dataUrl);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}
