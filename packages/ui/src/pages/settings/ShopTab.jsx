import React, { useRef, useState } from "react";
import { Sun, Moon, Monitor as MonitorIcon, Upload } from "lucide-react";
import { useTheme, useThemeTokens } from "../../lib/ThemeContext";
import { useSettings } from "../../lib/SettingsContext";
import { shrinkImage } from "../../lib/shrinkImage";
import BusinessTypeSection from "./BusinessTypeSection";
import ReceiptsTab from "./ReceiptsTab";
import SignatureField from "../../components/SignatureField";
import SettingsModal, { SettingsRow } from "../../components/SettingsModal";
import { BUSINESS_PRESETS } from "@techdesk/core";
import { CURRENCIES, DEFAULT_CURRENCY, money } from "../../lib/currency";

// The shop, first.
//
// This tab used to open on "Business type" -- a question you answer once, on
// the day you install, and never again -- and put the shop's own name, logo
// and number below it. So the thing every shop comes here to change was under
// the thing almost nobody does.
//
// It opens on the shop now: logo, name, the number customers ring, and email
// -- everything that actually prints on a receipt. Everything after that is
// a decision you make once, in a row you can read without opening.
//
// AND IT ASKS FOR LESS. A website, a VAT id, and three lines of bank details
// used to sit here too, unfolding into a form that asked eleven questions to
// print a receipt -- and nothing anywhere ever read them back. Removed
// outright rather than folded away, since a field nothing uses is not a
// convenience kept out of sight, it is paperwork.

const APPEARANCE_OPTIONS = [
  { key: "light", label: "Light", icon: Sun },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "system", label: "System", icon: MonitorIcon },
];

export default function ShopTab() {
  const t = useThemeTokens();
  const { dark, toggleDark } = useTheme();
  const { settings, updateSettings } = useSettings();
  const fileRef = useRef(null);
  // Which section is open, or null. One at a time: these are separate
  // decisions and stacking them would bury the one being made.
  const [openSection, setOpenSection] = useState(null);

  function set(field, value) {
    updateSettings({ [field]: value });
  }

  function selectAppearance(mode) {
    set("appearance", mode);
    if (mode === "dark" && !dark) toggleDark();
    if (mode === "light" && dark) toggleDark();
    if (mode === "system") {
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      if (prefersDark !== dark) toggleDark();
    }
  }

  const currentPresetLabel =
    BUSINESS_PRESETS[settings.businessType || "general"]?.label || "Electronics Repair";

  const currentAppearance = settings.appearance || (dark ? "dark" : "light");
  const currentAppearanceLabel =
    APPEARANCE_OPTIONS.find((o) => o.key === currentAppearance)?.label || "Light";

  const currency = CURRENCIES.find((c) => c.code === (settings.currency || DEFAULT_CURRENCY));

  function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    // Shrunk before it is stored: the logo is copied into every receipt and
    // every backup, and a photo straight off a phone would make each one
    // several megabytes.
    reader.onload = async () => set("logo", await shrinkImage(reader.result));
    reader.readAsDataURL(file);
  }

  const field = `w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`;
  const label = `text-sm font-medium block mb-1.5 ${t.textPrimary}`;

  return (
    <div className="flex flex-col gap-5">
      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        {/* The logo and the name together, because that is how a receipt
            carries them and how the shop thinks of them. */}
        <div className="flex items-start gap-4 mb-5 flex-wrap">
          <button
            onClick={() => fileRef.current?.click()}
            aria-label={settings.logo ? "Change shop logo" : "Add a shop logo"}
            className={`w-20 h-20 shrink-0 rounded-2xl flex flex-col items-center justify-center gap-1 text-[10px] overflow-hidden ${t.insetBg} ${t.textMuted}`}
          >
            {settings.logo ? (
              <img src={settings.logo} alt="Shop logo" className="w-full h-full object-cover" />
            ) : (
              <>
                <Upload className="w-4 h-4" aria-hidden="true" />
                Add logo
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={handleLogoUpload}
          />

          <div className="flex-1 min-w-[12rem]">
            <label htmlFor="shop-name" className={label}>
              Shop name
            </label>
            <input
              id="shop-name"
              value={settings.shopName}
              onChange={(e) => set("shopName", e.target.value)}
              placeholder="Your shop's name"
              className={field}
            />
            <p className={`text-xs mt-2 ${t.textMuted}`}>
              {settings.logo
                ? "Tap the logo to change it."
                : "Tap the square to add a logo. It goes on your receipts."}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="shop-phone" className={label}>
            Phone
          </label>
          <input
            id="shop-phone"
            value={settings.phone}
            onChange={(e) => set("phone", e.target.value)}
            inputMode="tel"
            placeholder="08012345678"
            className={field}
          />
        </div>

        <div>
          <label htmlFor="shop-address" className={label}>
            Address
          </label>
          <input
            id="shop-address"
            value={settings.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="Where the shop is"
            className={field}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="shop-email" className={label}>
            Email
          </label>
          <input
            id="shop-email"
            value={settings.email}
            onChange={(e) => set("email", e.target.value)}
            inputMode="email"
            placeholder="Not set — most shops leave this empty"
            className={field}
          />
        </div>

        <p className={`text-xs mt-4 ${t.textMuted}`}>
          This is what prints on your receipts. Changes save as you type.
        </p>
      </div>

      {/* Signed once, here -- not re-drawn by hand on every repair ticket
          and every sales receipt this shop ever prints. */}
      <h2 className={`text-xs font-semibold uppercase tracking-wider ${t.textMuted}`}>
        Authorized signature
      </h2>
      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <p className={`text-sm mb-3 ${t.textSecondary}`}>
          Printed automatically on every repair ticket and sales receipt from now on.
        </p>
        <SignatureField
          label="Your signature"
          value={settings.ownerSignature}
          onChange={(v) => set("ownerSignature", v)}
        />
      </div>

      {/* Set once, read at a glance. */}
      <SettingsRow
        title="Business type"
        description="The trade you are in, the wording used throughout the app, and your inventory categories."
        value={`${currentPresetLabel} · ${(settings.categories || []).length} categories`}
        onOpen={() => setOpenSection("businessType")}
      />

      <SettingsRow
        title="Currency"
        description="Used everywhere money appears. Changing it re-labels existing figures; it does not convert them."
        value={`${currency?.name || "Naira"} — prices show as ${money(45000, settings)}`}
        onOpen={() => setOpenSection("currency")}
      />

      <SettingsRow
        title="Appearance"
        description="Light, dark, or whatever this computer is set to."
        value={currentAppearanceLabel}
        onOpen={() => setOpenSection("appearance")}
      />

      <h2 className={`text-xs font-semibold uppercase tracking-wider ${t.textMuted}`}>Receipts</h2>
      <ReceiptsTab />

      {openSection === "businessType" && (
        <SettingsModal
          title="Business type"
          description="TechDesk works for any repair trade, not just phones and laptops. Pick the closest fit — this changes wording throughout the app (tickets, forms, receipts), and you can fine-tune any term afterwards."
          onClose={() => setOpenSection(null)}
        >
          <BusinessTypeSection />
        </SettingsModal>
      )}

      {openSection === "currency" && (
        <SettingsModal
          title="Currency"
          description="Used everywhere money appears — sales, inventory, repairs, reports, receipts and the messages you send customers."
          onClose={() => setOpenSection(null)}
        >
          <select
            id="shop-currency"
            value={settings.currency || DEFAULT_CURRENCY}
            onChange={(e) => updateSettings({ currency: e.target.value })}
            className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none ${
              t.dark
                ? "bg-white/5 border border-white/10 text-white"
                : "bg-slate-50 border border-slate-200 text-slate-900"
            }`}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.symbol}  {c.name} ({c.code})
              </option>
            ))}
          </select>
          <p className={`text-xs mt-3 ${t.textMuted}`}>
            Prices show as {money(45000, settings)}. Changing this re-labels the figures you
            already have; it does not convert them.
          </p>
        </SettingsModal>
      )}

      {openSection === "appearance" && (
        <SettingsModal
          title="Appearance"
          description="Applies straight away, and to this computer only."
          onClose={() => setOpenSection(null)}
        >
          <div className="flex flex-wrap items-center gap-3">
            {APPEARANCE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = currentAppearance === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => selectAppearance(opt.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                    active ? (t.dark ? "bg-white text-black" : "bg-slate-900 text-white") : t.pillBg
                  }`}
                >
                  <Icon className="w-4 h-4" /> {opt.label}
                </button>
              );
            })}
          </div>
        </SettingsModal>
      )}
    </div>
  );
}
