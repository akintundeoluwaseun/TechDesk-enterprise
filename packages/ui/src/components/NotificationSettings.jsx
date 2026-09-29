import React, { useEffect, useState } from "react";
import { Bell, BellOff, ShoppingBag, Wallet, PackageCheck } from "lucide-react";
import { platform } from "@techdesk/platform";
import { alertPrefs, setAlertPrefs } from "@techdesk/core";
import { useThemeTokens } from "../lib/ThemeContext";

const KINDS = [
  { key: "arrivals", Icon: ShoppingBag, title: "Sales and repairs from your team", text: "“Ade made a sale · ₦12,500 · 2 × Screen guard” as soon as it syncs from another device or branch." },
  { key: "owed", Icon: Wallet, title: "Customers who haven't paid", text: "Once a day, for anything still owed after a few days." },
  { key: "uncollected", Icon: PackageCheck, title: "Repairs not collected", text: "Once a day, for finished jobs still waiting on the shelf." },
];

function Switch({ on, onChange, label, t }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${on ? "bg-sky-500" : t.dark ? "bg-neutral-700" : "bg-neutral-300"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
    </button>
  );
}

export default function NotificationSettings() {
  const t = useThemeTokens();
  const [prefs, setPrefs] = useState(() => alertPrefs());
  const [permission, setPermission] = useState("default");
  const [note, setNote] = useState("");

  useEffect(() => {
    platform().notifyPermission?.(false).then(setPermission).catch(() => setPermission("unsupported"));
  }, []);

  function update(patch) {
    setPrefs(setAlertPrefs(patch));
  }

  async function allow() {
    const result = (await platform().notifyPermission?.(true)) || "unsupported";
    setPermission(result);
    if (result === "denied") setNote("Notifications are blocked for TechDesk. Allow them in your browser or phone settings, then come back.");
  }

  async function test() {
    const ok = await platform().notify?.({ title: "Ade made a sale", body: "₦12,500 · 2 × Screen guard · to Bola (this is a test)", tag: "test" });
    setNote(ok ? "Sent. If nothing appeared, check that your device isn't on Do Not Disturb." : "Couldn't show a notification here. Allow notifications first.");
  }

  const allowed = permission === "granted";

  return (
    <div className={`rounded-2xl p-6 ${t.cardBg}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.dark ? "bg-sky-500/15 text-sky-300" : "bg-sky-100 text-sky-600"}`}>
          {prefs.enabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold ${t.textPrimary}`}>Notifications</h3>
          <p className={`text-sm ${t.textSecondary}`}>
            Pop-ups on this device about your shop, even when TechDesk is in the background.
          </p>
        </div>
        <Switch t={t} on={prefs.enabled} onChange={(v) => update({ enabled: v })} label="Notifications on this device" />
      </div>

      {prefs.enabled && (
        <>
          {!allowed && permission !== "unsupported" && (
            <div className={`mt-4 flex flex-wrap items-center gap-3 rounded-xl p-3 ${t.insetBg}`}>
              <p className={`text-sm flex-1 min-w-[12rem] ${t.textSecondary}`}>
                {permission === "denied" ? "This device is blocking TechDesk's notifications." : "This device hasn't allowed TechDesk to show notifications yet."}
              </p>
              <button onClick={allow} className="px-4 py-2 rounded-full text-sm font-semibold bg-sky-500 text-white">
                Allow notifications
              </button>
            </div>
          )}

          <ul className="mt-4 flex flex-col gap-1">
            {KINDS.map(({ key, Icon, title, text }) => (
              <li key={key} className="flex items-center gap-3 py-2.5">
                <Icon className={`w-5 h-5 shrink-0 ${t.textMuted}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${t.textPrimary}`}>{title}</div>
                  <div className={`text-xs ${t.textSecondary}`}>{text}</div>
                </div>
                <Switch t={t} on={prefs[key]} onChange={(v) => update({ [key]: v })} label={title} />
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className={`text-sm ${t.textSecondary}`}>
              Remind after{" "}
              <select
                value={prefs.owedAfterDays}
                onChange={(e) => update({ owedAfterDays: Number(e.target.value), uncollectedAfterDays: Number(e.target.value) })}
                className={`ml-1 rounded-lg px-2 py-1 text-sm ${t.insetBg} ${t.textPrimary}`}
              >
                {[1, 2, 3, 5, 7, 14].map((d) => (
                  <option key={d} value={d}>{d} day{d === 1 ? "" : "s"}</option>
                ))}
              </select>
            </label>
            {allowed && (
              <button onClick={test} className={`ml-auto px-4 py-2 rounded-full text-sm font-medium ${t.pillBg}`}>
                Send a test
              </button>
            )}
          </div>
        </>
      )}

      {note && <p className={`mt-3 text-xs ${t.textSecondary}`}>{note}</p>}
    </div>
  );
}
