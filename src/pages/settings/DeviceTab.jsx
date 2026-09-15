import React, { useEffect, useRef, useState } from "react";
import { Download, Upload, Trash2, Mail, Send, Database, Network, QrCode, ShieldCheck, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useThemeTokens } from "../../lib/ThemeContext";
import { db } from "../../lib/db";
import { findOtherEditions } from "../../lib/editionData";
import DataMergeModal from "../../components/DataMergeModal";

export default function DeviceTab() {
  const t = useThemeTokens();
  const fileRef = useRef(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState(() => db.getSettings?.().notificationEmail || "");
  const [emailSaved, setEmailSaved] = useState(false);
  const isDesktopApp = typeof window !== "undefined" && !!window.techdesk;
  const [network, setNetwork] = useState({ ip: isDesktopApp ? "Loading..." : "Desktop app only", url: "" });

  const [dailyDigestEnabled, setDailyDigestEnabled] = useState(() => !!db.getSettings?.().dailyDigestEnabled);
  const [dailyDigestTime, setDailyDigestTime] = useState(() => db.getSettings?.().dailyDigestTime || "08:00");
  const [digestSaved, setDigestSaved] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (!isDesktopApp) return;
    window.techdesk
      .getNetworkInfo()
      .then(setNetwork)
      .catch(() => setNetwork({ ip: "Unavailable", url: "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [mergeEditions, setMergeEditions] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");

  async function handleScanForEditions() {
    setScanning(true);
    setScanMessage("");
    try {
      const found = await findOtherEditions();
      if (found.length) setMergeEditions(found);
      else setScanMessage("No other TechDesk edition with saved data was found on this device.");
    } catch {
      setScanMessage("Couldn't check for other editions.");
    } finally {
      setScanning(false);
    }
  }

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

  function saveNotificationEmail(value = notificationEmail) {
    db.saveSettings({ ...db.getSettings(), notificationEmail: value });
    setEmailSaved(true);
    setTimeout(() => setEmailSaved(false), 1800);
  }

  function sendActivityEmail() {
    const recent = db.getActivity().slice(0, 20);
    const lines = recent.map((a) => `- ${new Date(a.createdAt).toLocaleString()}: ${a.message}`).join("\n");
    const subject = encodeURIComponent("Activity report");
    const body = encodeURIComponent(`Recent activity:\n\n${lines || "No activity yet."}`);
    const to = encodeURIComponent(notificationEmail || "");
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  function saveDigestSettings(patch = {}) {
    const next = { ...db.getSettings(), dailyDigestEnabled, dailyDigestTime, ...patch };
    db.saveSettings(next);
    setDigestSaved(true);
    setTimeout(() => setDigestSaved(false), 1800);
  }

  function toggleDailyDigest() {
    const next = !dailyDigestEnabled;
    setDailyDigestEnabled(next);
    saveDigestSettings({ dailyDigestEnabled: next });
  }

  function handleDigestTimeChange(e) {
    const value = e.target.value;
    setDailyDigestTime(value);
    saveDigestSettings({ dailyDigestTime: value });
  }

  async function handleSendTestEmail() {
    if (!isDesktopApp || !window.techdesk?.sendTestEmail) {
      alert("Sending email only works in the installed desktop app.");
      return;
    }
    if (!notificationEmail) {
      setTestResult({ ok: false, error: "Enter an email address above first." });
      return;
    }
    saveNotificationEmail();
    setTestSending(true);
    setTestResult(null);
    const result = await window.techdesk.sendTestEmail({ to: notificationEmail });
    setTestSending(false);
    setTestResult(result);
  }

  const input = `w-full rounded-xl px-3 py-2.5 text-sm outline-none ${t.inputBg}`;

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
          <Database className={t.dark ? "text-blue-300" : "text-blue-500"} size={20} />
          <div>
            <h3 className={`font-semibold ${t.textPrimary}`}>Bring data from another TechDesk edition</h3>
            <p className={`text-sm ${t.textSecondary}`}>
              If another edition (Solo, Business or Enterprise) is installed on this device, its
              sales, repairs, inventory and customers can be copied across. Records already here
              are left as they are, and nothing is removed from the other edition.
            </p>
          </div>
        </div>
        <button
          onClick={handleScanForEditions}
          disabled={scanning}
          className={`mt-4 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium disabled:opacity-50 ${t.pillBg}`}
        >
          <Database className="w-4 h-4" /> {scanning ? "Checking…" : "Check for other editions"}
        </button>
        {scanMessage && <p className={`text-xs mt-3 ${t.textMuted}`}>{scanMessage}</p>}
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
            onChange={(e) => {
              setNotificationEmail(e.target.value);
              saveNotificationEmail(e.target.value);
            }}
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
          <Clock className={t.dark ? "text-amber-300" : "text-amber-500"} size={20} />
          <div>
            <h3 className={`font-semibold ${t.textPrimary}`}>Automatic daily digest<span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300">Coming soon</span></h3>
            <p className={`text-sm ${t.textSecondary}`}>
              Sends a real email every day with today's activity, active repairs, and low stock — to the address
              above. Nothing else to set up.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 flex-wrap pointer-events-none opacity-50" aria-disabled="true">
          <button
            onClick={toggleDailyDigest}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
              dailyDigestEnabled ? "bg-emerald-500 text-white" : t.pillBg
            }`}
          >
            {dailyDigestEnabled ? "Digest: On" : "Digest: Off"}
          </button>
          {dailyDigestEnabled && (
            <label className="flex items-center gap-2 text-sm">
              <span className={t.textSecondary}>Send at</span>
              <input
                type="time"
                value={dailyDigestTime}
                onChange={handleDigestTimeChange}
                className={`rounded-lg px-3 py-1.5 text-sm outline-none ${t.inputBg}`}
              />
            </label>
          )}
          <button
            onClick={handleSendTestEmail}
            disabled={testSending}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg} ${testSending ? "opacity-60" : ""}`}
          >
            <Send className="w-4 h-4" /> {testSending ? "Sending…" : digestSaved ? "Saved" : "Send test email"}
          </button>
        </div>
        {testResult && (
          <p className={`mt-3 flex items-center gap-1.5 text-sm ${testResult.ok ? "text-emerald-500" : "text-red-500"}`}>
            {testResult.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {testResult.ok ? "Sent successfully." : testResult.error || "Send failed."}
          </p>
        )}
        {!isDesktopApp && (
          <p className={`mt-3 text-xs ${t.textMuted}`}>Sending only works in the installed desktop app, not in a browser tab.</p>
        )}
      </div>

      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center gap-3">
          <Network className={t.dark ? "text-amber-300" : "text-amber-500"} size={20} />
          <div>
            <h3 className={`font-semibold ${t.textPrimary}`}>Local activity connection<span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300">Coming soon</span></h3>
            <p className={`text-sm ${t.textSecondary}`}>Connected devices can open a read-only activity log on the same network.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 pointer-events-none opacity-50" aria-disabled="true">
          <div className={`rounded-xl p-4 ${t.insetBg}`}>
            <div className={`text-xs uppercase tracking-wider ${t.textMuted}`}>PC address</div>
            <div className={`mt-2 break-all font-mono text-lg ${t.textPrimary}`}>{network.url || network.ip}</div>
          </div>
          <div className={`rounded-xl p-4 ${t.insetBg}`}>
            <div className={`text-xs uppercase tracking-wider ${t.textMuted}`}>Connection</div>
            <div className="mt-2 flex items-center gap-2 text-sm text-emerald-500">
              <ShieldCheck size={16} /> Read-only activity log
            </div>
            <div className={`mt-1 text-xs ${t.textMuted}`}>Use the QR code or enter the address manually.</div>
            <div className={`mt-1 text-xs ${t.textMuted}`}>
              Works on any phone on this Wi-Fi — no app to install, and nothing on the phone can change your data.
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            if (!isDesktopApp) {
              alert("The local activity connection only works in the installed desktop app, not in a browser tab.");
              return;
            }
            window.techdesk.showNetworkQr(network.url);
          }}
          className={`mt-4 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold ${t.pillBg}`}
        >
          <QrCode className="w-4 h-4" /> Show connection QR
        </button>
        {!isDesktopApp && (
          <p className={`mt-3 text-xs ${t.textMuted}`}>
            Not available here — this needs the installed desktop app, since it runs a small server on this
            device that a browser tab can't provide.
          </p>
        )}
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

      {mergeEditions.length > 0 && (
        <DataMergeModal editions={mergeEditions} onClose={() => setMergeEditions([])} />
      )}
    </div>
  );
}
