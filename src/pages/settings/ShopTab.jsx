import React, { useRef } from "react";
import { Sun, Moon, Monitor as MonitorIcon, Upload } from "lucide-react";
import { useTheme, useThemeTokens } from "../../lib/ThemeContext";
import { useSettings } from "../../lib/SettingsContext";
import BusinessTypeSection from "./BusinessTypeSection";

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

  function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set("logo", reader.result);
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col gap-5">
      <BusinessTypeSection />

      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <h3 className={`font-semibold mb-4 ${t.textPrimary}`}>Appearance</h3>
        <div className="flex items-center gap-3">
          {APPEARANCE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = (settings.appearance || (dark ? "dark" : "light")) === opt.key;
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
      </div>

      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <h3 className={`font-semibold mb-1 ${t.textPrimary}`}>Shop details (used on receipts)</h3>

        <div className="mt-4 mb-4">
          <label className={`text-sm font-medium block mb-2 ${t.textPrimary}`}>Shop logo</label>
          <div className="flex items-center gap-4">
            <div
              className={`w-16 h-16 rounded-xl flex items-center justify-center text-xs overflow-hidden ${
                t.dark ? "border border-white/10" : "border border-slate-200"
              } ${t.textMuted}`}
            >
              {settings.logo ? (
                <img src={settings.logo} alt="Shop logo" className="w-full h-full object-cover" />
              ) : (
                "No logo"
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium ${t.pillBg}`}
            >
              <Upload className="w-4 h-4" /> Upload image
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleLogoUpload} />
          </div>
          <p className={`text-xs mt-2 ${t.textMuted}`}>PNG or JPG, max 1.5MB. Stored on this device.</p>
        </div>

        <div className="mb-4">
          <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Shop name</label>
          <input
            value={settings.shopName}
            onChange={(e) => set("shopName", e.target.value)}
            className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
          />
        </div>

        <div className="mb-4">
          <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Address</label>
          <input
            value={settings.address}
            onChange={(e) => set("address", e.target.value)}
            className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Phone</label>
            <input
              value={settings.phone}
              onChange={(e) => set("phone", e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            />
          </div>
          <div>
            <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Email</label>
            <input
              value={settings.email}
              onChange={(e) => set("email", e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Website</label>
            <input
              value={settings.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="techdesk.ng"
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            />
          </div>
          <div>
            <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Tax / VAT ID</label>
            <input
              value={settings.taxId}
              onChange={(e) => set("taxId", e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            />
          </div>
        </div>

        <h4 className={`text-sm font-semibold mt-2 mb-3 ${t.textPrimary}`}>Bank details (for transfer payments)</h4>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Bank name</label>
            <input
              value={settings.bankName}
              onChange={(e) => set("bankName", e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            />
          </div>
          <div>
            <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Account number</label>
            <input
              value={settings.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            />
          </div>
        </div>

        <div>
          <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Account name</label>
          <input
            value={settings.accountName}
            onChange={(e) => set("accountName", e.target.value)}
            className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
          />
        </div>

        <p className={`text-xs mt-4 ${t.textMuted}`}>Changes save automatically.</p>
      </div>
    </div>
  );
}
