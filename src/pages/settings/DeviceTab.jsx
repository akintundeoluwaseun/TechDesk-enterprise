import React, { useEffect, useRef, useState } from "react";
import { Download, Upload, Trash2, Mail, Send, Network, QrCode, ShieldCheck } from "lucide-react";
import { useThemeTokens } from "../../lib/ThemeContext";
import { db } from "../../lib/db";

export default function DeviceTab() {
  const t = useThemeTokens();
  const fileRef = useRef(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState(() => db.getSettings?.().notificationEmail || "");
  const [emailSaved, setEmailSaved] = useState(false);
  const [network, setNetwork] = useState({ ip: "Unavailable", url: "" });

  useEffect(() => {
    window.techdesk?.getNetworkInfo?.().then(setNetwork).catch(() => {});
  }, []);

  function handleDownloadBackup() {
    const json = db.exportBackup();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `techdesk-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleRestoreClick() {
    fileRef.current?.click();
  }

  function handleRestoreFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        db.restoreBackup(reader.result);
        window.location.reload();
      } catch {
        alert("Invalid backup file.");
      }
    };
    reader.readAsText(file);
  }

  function handleErase() {
    if (!confirmErase) {
      setConfirmErase(true);
      return;
    }
    db.eraseAllData();
    window.location.reload();
  }

  function saveNotificationEmail() {
    db.saveSettings({ ...db.getSettings(), notificationEmail });
    setEmailSaved(true);
    setTimeout(() => setEmailSaved(false), 1800);
  }

  function sendActivityEmail() {
    const recent = db.getActivity().slice(0, 20);
    const lines = recent.map((a) => `- ${new Date(a.createdAt).toLocaleString()}: ${a.message}`).join("\n");
    const subject = encodeURIComponent("TechDesk Solo activity report");
    const body = encodeURIComponent(`Recent activity:\n\n${lines || "No activity yet."}`);
    const to = encodeURIComponent(notificationEmail || "");
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  const input = `w-full rounded-xl px-3 py-2.5 text-sm outline-none ${
    t.dark ? "bg-white/5 border border-white/10 text-white" : "bg-slate-50 border border-slate-200 text-slate-900"
  }`;

  return (
    <div className="flex flex-col gap-5">
      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <h3 className={`font-semibold mb-1 ${t.textPrimary}`}>Backup &amp; restore</h3>
        <p className={`text-sm mb-4 ${t.textSecondary}`}>
          Save a copy of everything on this device to a file, or restore from a previous backup. Restoring
          replaces all current data on this device. TechDesk also saves an automatic backup once a day to this
          device's app data folder (the last 14 are kept) as a safety net between manual backups.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadBackup}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium ${t.pillBg}`}
          >
            <Download className="w-4 h-4" /> Download backup
          </button>
          <button
            onClick={handleRestoreClick}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium ${t.pillBg}`}
          >
            <Upload className="w-4 h-4" /> Restore backup
          </button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleRestoreFile} />
        </div>
      </div>

      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center gap-3">
          <Mail className={t.dark ? "text-amber-300" : "text-amber-500"} size={20} />
          <div>
            <h3 className={`font-semibold ${t.textPrimary}`}>Email activity report</h3>
            <p className={`text-sm ${t.textSecondary}`}>
              Opens your own Mail app with recent activity pre-filled — you review and hit send. Nothing is
              stored or sent automatically, and no password is needed.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <input
            className={input}
            placeholder="Email to send the report to"
            value={notificationEmail}
            onChange={(e) => setNotificationEmail(e.target.value)}
            onBlur={saveNotificationEmail}
          />
          <button
            onClick={sendActivityEmail}
            className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg}`}
          >
            <Send className="w-4 h-4" /> {emailSaved ? "Saved" : "Email activity report"}
          </button>
        </div>
      </div>

      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center gap-3">
          <Network className={t.dark ? "text-amber-300" : "text-amber-500"} size={20} />
          <div>
            <h3 className={`font-semibold ${t.textPrimary}`}>Local activity connection</h3>
            <p className={`text-sm ${t.textSecondary}`}>Connected devices can open a read-only activity log on the same network.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className={`rounded-xl p-4 ${t.dark ? "bg-white/5" : "bg-slate-50"}`}>
            <div className={`text-xs uppercase tracking-wider ${t.textMuted}`}>PC address</div>
            <div className={`mt-2 break-all font-mono text-lg ${t.textPrimary}`}>{network.url || network.ip}</div>
          </div>
          <div className={`rounded-xl p-4 ${t.dark ? "bg-white/5" : "bg-slate-50"}`}>
            <div className={`text-xs uppercase tracking-wider ${t.textMuted}`}>Connection</div>
            <div className="mt-2 flex items-center gap-2 text-sm text-emerald-500">
              <ShieldCheck size={16} /> Read-only activity log
            </div>
            <div className={`mt-1 text-xs ${t.textMuted}`}>Use the QR code or enter the address manually.</div>
          </div>
        </div>
        <button
          onClick={() => window.techdesk?.showNetworkQr?.(network.url)}
          className={`mt-4 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold ${t.pillBg}`}
        >
          <QrCode className="w-4 h-4" /> Show connection QR
        </button>
      </div>

      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <h3 className={`font-semibold mb-1 ${t.textPrimary}`}>Device data</h3>
        <p className={`text-sm mb-4 ${t.textSecondary}`}>
          TechDesk runs fully offline. All sales, repairs, inventory and customers are stored on this device only.
        </p>
        <button
          onClick={handleErase}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium ${
            confirmErase ? "bg-red-500 text-white" : "text-red-500 " + (t.dark ? "bg-red-500/10" : "bg-red-50")
          }`}
        >
          <Trash2 className="w-4 h-4" /> {confirmErase ? "Click again to confirm" : "Erase all data"}
        </button>
      </div>
    </div>
  );
}
