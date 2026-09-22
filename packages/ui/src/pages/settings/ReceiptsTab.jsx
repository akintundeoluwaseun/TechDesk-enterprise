import React, { useState } from "react";
import { useThemeTokens } from "../../lib/ThemeContext";
import { useSettings } from "../../lib/SettingsContext";
import Fold from "../../components/Fold";

// What a customer goes home with.
//
// Two boxes, because two things actually get changed: the return policy and
// the line at the bottom. The WhatsApp message has a default that works, and
// its list of {{tokens}} is the most developer-shaped thing in the whole app
// -- so it is folded away rather than put in front of a shop that came here
// to write "Thank you for your custom".
export default function ReceiptsTab() {
  const t = useThemeTokens();
  const { settings, updateSettings } = useSettings();
  const [showTemplate, setShowTemplate] = useState(false);

  function set(field, value) {
    updateSettings({ [field]: value });
  }

  const box = `w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none ${t.inputBg}`;
  const label = `text-sm font-medium block mb-1.5 ${t.textPrimary}`;

  return (
    <div className="flex flex-col gap-5">
      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <h3 className={`font-semibold mb-4 ${t.textPrimary}`}>Receipt text</h3>

        <div className="mb-4">
          <label htmlFor="receipt-return-policy" className={label}>
            Return policy
          </label>
          <textarea
            id="receipt-return-policy"
            value={settings.returnPolicy}
            onChange={(e) => set("returnPolicy", e.target.value)}
            placeholder="e.g. Goods sold are not returnable except faulty within 7 days."
            rows={3}
            className={box}
          />
        </div>

        <div>
          <label htmlFor="receipt-footer" className={label}>
            Receipt footer
          </label>
          <textarea
            id="receipt-footer"
            value={settings.receiptFooter}
            onChange={(e) => set("receiptFooter", e.target.value)}
            placeholder="Thank you for your custom."
            rows={3}
            className={box}
          />
        </div>

        <p className={`text-xs mt-4 ${t.textMuted}`}>Changes save as you type.</p>
      </div>

      <Fold
        open={showTemplate}
        onToggle={() => setShowTemplate((v) => !v)}
        title="WhatsApp message wording"
        summary={
          (settings.whatsappTemplate || "").trim()
            ? "You have written your own"
            : "Using the built-in wording — most shops leave this alone"
        }
      >
        <p className={`text-xs mb-3 ${t.textMuted}`}>
          Anything in double braces is filled in for you: {"{{customer_name}}"},{" "}
          {"{{ticket_no}}"}, {"{{device}}"}, {"{{status}}"}, {"{{repair_cost}}"},{" "}
          {"{{amount_paid}}"}, {"{{balance}}"}, {"{{shop_name}}"}, {"{{imei}}"},{" "}
          {"{{serial_no}}"}. Wrap a part that should only appear sometimes in{" "}
          {"{{#balance}}"}&hellip;{"{{/balance}}"}.
        </p>
        <textarea
          id="whatsapp-template"
          value={settings.whatsappTemplate}
          onChange={(e) => set("whatsappTemplate", e.target.value)}
          placeholder="Leave blank to use the built-in wording"
          rows={6}
          className={box}
        />
      </Fold>
    </div>
  );
}
