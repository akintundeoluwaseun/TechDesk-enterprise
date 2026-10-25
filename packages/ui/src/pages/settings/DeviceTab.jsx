import React, { useEffect, useRef, useState } from "react";
import { Download, Upload, Trash2, Database, Network, QrCode, ShieldCheck, Globe } from "lucide-react";
import { useThemeTokens } from "../../lib/ThemeContext";
import { db } from "../../lib/db";
import { findOtherEditions } from "../../lib/editionData";
import { IS_DESKTOP_APP } from "../../lib/platform";
import DataMergeModal from "../../components/DataMergeModal";
import NotificationSettings from "../../components/NotificationSettings";
import { SITE_ORIGIN } from "@techdesk/editions";

export default function DeviceTab() {
  const t = useThemeTokens();
  const fileRef = useRef(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const isDesktopApp = typeof window !== "undefined" && !!window.techdesk;
  const [network, setNetwork] = useState({ ip: isDesktopApp ? "Loading..." : "Desktop app only", url: "" });


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

  const input = `w-full rounded-xl px-3 py-2.5 text-sm outline-none ${t.inputBg}`;

  return (
    <div className="flex flex-col gap-5">
      <NotificationSettings />

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

      {/* Desktop only. It looks for other editions installed on the same
          computer, which is an Electron-only search -- on a phone it can
          only ever answer "none found", so offering it there is a button
          whose single outcome is disappointment. */}
      {IS_DESKTOP_APP && (
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
      )}

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

      {/* Where TechDesk lives on the web.
          A shop that wants to put it on a second computer, send a staff
          member the download, or just show somebody what they are using had
          no address to go to from inside the app -- it was only ever in the
          legal pages, printed as text. SITE_ORIGIN is the one place that
          address is written down, the same constant the privacy and terms
          links use, so this cannot drift from them. */}
      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <h3 className={`font-semibold mb-1 ${t.textPrimary}`}>TechDesk on the web</h3>
        <p className={`text-sm mb-4 ${t.textSecondary}`}>
          Downloads for another computer or phone, and everything TechDesk can do.
        </p>
        <a
          href={SITE_ORIGIN}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium ${t.pillBg}`}
        >
          <Globe className="w-4 h-4" /> {SITE_ORIGIN.replace(/^https:\/\//, "")}
        </a>
      </div>

      {mergeEditions.length > 0 && (
        <DataMergeModal editions={mergeEditions} onClose={() => setMergeEditions([])} />
      )}
    </div>
  );
}
