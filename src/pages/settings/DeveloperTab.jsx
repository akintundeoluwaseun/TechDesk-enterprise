import React, { useEffect, useState } from "react";
import { Code2, Mail, Network, Phone, MessageCircle, QrCode, Save, ShieldCheck } from "lucide-react";
import { useThemeTokens } from "../../lib/ThemeContext";
import { db } from "../../lib/db";

const defaults = {
  notificationEmail: "",
  smtpHost: "smtp.gmail.com",
  smtpPort: "465",
  smtpUser: "",
  smtpAppPassword: "",
  adsEnabled: false,
};

const CONTACT_ROWS = [
  { icon: Phone, label: "+234 807 691 1614", href: "tel:+2348076911614" },
  { icon: Mail, label: "seun85148@gmail.com", href: "mailto:seun85148@gmail.com" },
  { icon: MessageCircle, label: "Chat on WhatsApp", href: "https://wa.me/2348076911614", accent: true },
];

export default function DeveloperTab() {
  const t = useThemeTokens();
  const [settings, setSettings] = useState({ ...defaults, ...(db.getSettings?.() || {}) });
  const [network, setNetwork] = useState({ ip: "Unavailable", url: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.techdesk?.getNetworkInfo?.().then(setNetwork).catch(() => {});
  }, []);

  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const save = () => {
    db.saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const input = `w-full rounded-xl px-3 py-2.5 text-sm outline-none ${
    t.dark ? "bg-white/5 border border-white/10 text-white" : "bg-slate-50 border border-slate-200 text-slate-900"
  }`;

  return (
    <div className="space-y-5">
      <section className={`rounded-2xl p-6 ${t.cardBg}`}>
        <h3 className={`font-semibold mb-1 ${t.textPrimary}`}>Developer</h3>
        <p className={`text-sm mb-4 ${t.textSecondary}`}>Built and maintained by</p>

        <div className="flex items-center gap-3 mb-5">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${t.dark ? "bg-white/10" : "bg-slate-100"}`}>
            <Code2 className={`w-4 h-4 ${t.textSecondary}`} />
          </div>
          <div>
            <div className={`font-semibold ${t.textPrimary}`}>Akintunde Oluwaseun Joshua</div>
            <div className={`text-sm ${t.textMuted}`}>Software developer</div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {CONTACT_ROWS.map((r) => {
            const Icon = r.icon;
            return (
              <a
                key={r.label}
                href={r.href}
                target={r.href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className={`flex items-center gap-3 text-sm ${r.accent ? "text-emerald-500" : t.textSecondary}`}
              >
                <Icon className="w-4 h-4" /> {r.label}
              </a>
            );
          })}
        </div>
      </section>

      <section className={`rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center gap-3">
          <Mail className="text-amber-400" size={20} />
          <div>
            <h3 className={`font-semibold ${t.textPrimary}`}>Email notifications</h3>
            <p className={`text-sm ${t.textSecondary}`}>Queue alerts offline and send them when connectivity returns.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <input
            className={input}
            placeholder="Email to receive alerts"
            value={settings.notificationEmail}
            onChange={(e) => update("notificationEmail", e.target.value)}
          />
          <input
            className={input}
            placeholder="Email address used to send"
            value={settings.smtpUser}
            onChange={(e) => update("smtpUser", e.target.value)}
          />
          <input
            className={input}
            placeholder="Email password"
            type="password"
            value={settings.smtpAppPassword}
            onChange={(e) => update("smtpAppPassword", e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <input className={input} value={settings.smtpHost} onChange={(e) => update("smtpHost", e.target.value)} />
            <input className={input} value={settings.smtpPort} onChange={(e) => update("smtpPort", e.target.value)} />
          </div>
        </div>
        <p className={`mt-3 text-xs ${t.textMuted}`}>
          Works with any email provider's normal login — no special app password needed. Notifications cover sales,
          repairs, inventory, low stock, reports, and sync failures.
        </p>
      </section>

      <section className={`rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center gap-3">
          <Network className="text-amber-400" size={20} />
          <div>
            <h3 className={`font-semibold ${t.textPrimary}`}>Local activity connection</h3>
            <p className={`text-sm ${t.textSecondary}`}>Connected devices can open a read-only activity log on the same network.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className={`rounded-xl p-4 ${t.dark ? "bg-white/5" : "bg-slate-50"}`}>
            <div className={`text-xs uppercase tracking-wider ${t.textMuted}`}>PC address</div>
            <div className={`mt-2 break-all font-mono text-lg ${t.textPrimary}`}>{network.url || network.ip}</div>
          </div>
          <div className={`rounded-xl p-4 ${t.dark ? "bg-white/5" : "bg-slate-50"}`}>
            <div className={`text-xs uppercase tracking-wider ${t.textMuted}`}>Connection</div>
            <div className="mt-2 flex items-center gap-2 text-sm text-emerald-400">
              <ShieldCheck size={16} /> Read-only activity log
            </div>
            <div className={`mt-1 text-xs ${t.textMuted}`}>Use the QR code or enter the address manually.</div>
          </div>
        </div>
        <button
          onClick={() => window.techdesk?.showNetworkQr?.(network.url)}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-black"
        >
          <QrCode size={16} /> Show connection QR
        </button>
      </section>

      <section className={`rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center gap-3">
          <Code2 className="text-amber-400" size={20} />
          <div>
            <h3 className={`font-semibold ${t.textPrimary}`}>Optional ads</h3>
            <p className={`text-sm ${t.textSecondary}`}>Reserved for future AdSense placement. Ads are disabled until you add a publisher ID.</p>
          </div>
        </div>
        <div className={`mt-5 grid gap-3 sm:grid-cols-2 ${t.dark ? "text-white/40" : "text-slate-400"}`}>
          <div aria-disabled="true" className="min-h-20 rounded-xl border border-dashed border-current/30 p-4 text-xs">
            <span className="font-semibold uppercase tracking-wider">Ad slot A</span>
            <div className="mt-2">Inactive · no publisher configured</div>
          </div>
          <div aria-disabled="true" className="min-h-20 rounded-xl border border-dashed border-current/30 p-4 text-xs">
            <span className="font-semibold uppercase tracking-wider">Ad slot B</span>
            <div className="mt-2">Inactive · no publisher configured</div>
          </div>
        </div>
      </section>

      <button onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black">
        <Save size={16} /> {saved ? "Saved" : "Save notification settings"}
      </button>
    </div>
  );
}
