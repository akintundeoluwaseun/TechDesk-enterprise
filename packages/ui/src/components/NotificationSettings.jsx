import React, { useEffect, useState } from "react";
import { Bell, BellRing, BellOff, ShoppingBag, Wallet, PackageCheck } from "lucide-react";
import { platform } from "@techdesk/platform";
import { useThemeTokens } from "../lib/ThemeContext";

// What TechDesk tells you about. Not switches: these are always on, and the
// reminders stop on their own once the customer pays or collects.
const KINDS = [
  { Icon: ShoppingBag, title: "Sales and repairs from your team", text: "“Ade made a sale · ₦12,500 · 2 × Screen guard” as soon as it reaches this device." },
  { Icon: Wallet, title: "Customers who haven't paid", text: "Every 5 hours until the money is in." },
  { Icon: PackageCheck, title: "Repairs not collected", text: "Every 5 hours until the customer picks it up." },
];

export default function NotificationSettings() {
  const t = useThemeTokens();
  const [permission, setPermission] = useState("default");
  const [note, setNote] = useState("");

  useEffect(() => {
    platform().notifyPermission?.(false).then(setPermission).catch(() => setPermission("unsupported"));
  }, []);

  async function allow() {
    const result = (await platform().notifyPermission?.(true)) || "unsupported";
    setPermission(result);
  }

  async function test() {
    const ok = await platform().notify?.({ title: "Ade made a sale", body: "₦12,500 · 2 × Screen guard · to Bola (this is a test)", tag: "test" });
    setNote(ok ? "Sent. If nothing appeared, check that your device isn't on Do Not Disturb." : "Couldn't show a notification here.");
  }

  const on = permission === "granted";
  const blocked = permission === "denied";
  const StateIcon = on ? BellRing : blocked ? BellOff : Bell;

  return (
    <div className={`rounded-2xl p-6 ${t.cardBg}`}>
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            on ? (t.dark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-100 text-emerald-600")
              : blocked ? (t.dark ? "bg-red-500/15 text-red-300" : "bg-red-100 text-red-600")
              : (t.dark ? "bg-sky-500/15 text-sky-300" : "bg-sky-100 text-sky-600")
          }`}
        >
          <StateIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold ${t.textPrimary}`}>Notifications</h3>
          <p className={`text-sm ${t.textSecondary}`}>
            {on
              ? "On. TechDesk will pop up on this device, even when it's in the background."
              : blocked
                ? "Blocked on this device. Open your browser or phone settings, find TechDesk, and allow notifications."
                : permission === "unsupported"
                  ? "This device can't show notifications. You'll still see them in the bell."
                  : "Allow notifications so TechDesk can tell you about sales and who still owes you."}
          </p>
        </div>
        {on ? (
          <button onClick={test} className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium ${t.pillBg}`}>
            Send a test
          </button>
        ) : !blocked && permission !== "unsupported" ? (
          <button onClick={allow} className="shrink-0 px-4 py-2 rounded-full text-sm font-semibold bg-sky-500 text-white">
            Allow
          </button>
        ) : null}
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {KINDS.map(({ Icon, title, text }) => (
          <li key={title} className={`rounded-xl p-3 ${t.insetBg}`}>
            <Icon className={`w-5 h-5 mb-2 ${t.textMuted}`} />
            <div className={`text-sm font-medium ${t.textPrimary}`}>{title}</div>
            <div className={`text-xs mt-0.5 ${t.textSecondary}`}>{text}</div>
          </li>
        ))}
      </ul>

      {note && <p className={`mt-3 text-xs ${t.textSecondary}`}>{note}</p>}
    </div>
  );
}
