import React, { useRef, useState } from "react";
import { Sun, Moon, Monitor as MonitorIcon, Upload } from "lucide-react";
import { useTheme, useThemeTokens } from "../../lib/ThemeContext";
import { useSettings } from "../../lib/SettingsContext";
import { shrinkImage } from "../../lib/shrinkImage";
import BusinessTypeSection from "./BusinessTypeSection";
import ReceiptsTab from "./ReceiptsTab";
import SettingsModal, { SettingsRow } from "../../components/SettingsModal";
import Fold from "../../components/Fold";
import { BUSINESS_PRESETS } from "@techdesk/core";
import { CURRENCIES, DEFAULT_CURRENCY, money } from "../../lib/currency";

// The shop, first.
//
// This tab used to open on "Business type" -- a question you answer once, on
// the day you install, and never again -- and put the shop's own name, logo
// and number below it. So the thing every shop comes here to change was under
// the thing almost nobody does.
//
// It opens on the shop now: logo, name, the number customers ring. Everything
// after that is a decision you make once, in a row you can read without
// opening.
//
// AND IT ASKS FOR LESS. Six of the old fields were on screen whether the shop
// had any use for them or not -- a website, a VAT id, three lines of bank
// details -- and a form that asks eleven questions to print a receipt reads
// like paperwork. They are all still here, behind two headings that say what
// they are for, so a shop that wants them opens one and a shop that does not
// never sees them.

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
  // The fields most shops never fill in, folded away rather than removed.
  const [showMore, setShowMore] = useState(false);
  const [showBank, setShowBank] = useState(false);

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

  // Said on the collapsed rows, so nothing has to be opened to find out
  // whether there is anything in there.
  const extras = ["email", "website", "taxId"].filter((f) => (settings[f] || "").trim()).length;
  const bankFilled = Boolean((settings.accountNumber || "").trim());

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

        <p className={`text-xs mt-4 ${t.textMuted}`}>
          This is what prints on your receipts. Changes save as you type.
        </p>
      </div>

      {/* Everything below is optional, and says so by being shut. */}
      <Fold
        open={showMore}
        onToggle={() => setShowMore((v) => !v)}
        title="Email, website, VAT"
        summary={extras === 0 ? "Not set — most shops leave these empty" : `${extras} set`}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="shop-email" className={label}>
              Email
            </label>
            <input
              id="shop-email"
              value={settings.email}
              onChange={(e) => set("email", e.target.value)}
              inputMode="email"
              className={field}
            />
          </div>
          <div>
            <label htmlFor="shop-website" className={label}>
              Website
            </label>
            <input
              id="shop-website"
              value={settings.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="yourshop.com"
              className={field}
            />
          </div>
        </div>
        <div className="mt-4 md:w-1/2 md:pr-2">
          <label htmlFor="shop-tax" className={label}>
            Tax / VAT ID
          </label>
          <input
            id="shop-tax"
            value={settings.taxId}
            onChange={(e) => set("taxId", e.target.value)}
            className={field}
          />
        </div>
      </Fold>

      <Fold
        open={showBank}
        onToggle={() => setShowBank((v) => !v)}
        title="Bank details"
        summary={
          bankFilled
            ? `${settings.bankName || "Bank"} · ${settings.accountNumber}`
            : "For customers paying by transfer"
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="shop-bank" className={label}>
              Bank name
            </label>
            <input
              id="shop-bank"
              value={settings.bankName}
              onChange={(e) => set("bankName", e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label htmlFor="shop-account-number" className={label}>
              Account number
            </label>
            <input
              id="shop-account-number"
              value={settings.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value)}
              inputMode="numeric"
              className={field}
            />
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="shop-account-name" className={label}>
            Account name
          </label>
          <input
            id="shop-account-name"
            value={settings.accountName}
            onChange={(e) => set("accountName", e.target.value)}
            className={field}
          />
        </div>
      </Fold>

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
