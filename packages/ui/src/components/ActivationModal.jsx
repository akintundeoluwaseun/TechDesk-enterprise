import React, { useState } from "react";
import { X, ShieldCheck, Phone, Mail, Globe, Copy, Check } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { useLicense } from "../lib/LicenseContext";
import { CAPABILITIES, TIER_META, sitePage, siteLabel } from "@techdesk/editions";
import { addedBy } from "../lib/featureLabels";
import { formatCode } from "../lib/activationCode";

// The upgrade screen.
//
// It used to be the activation screen for a 7-day trial, and it still read
// like one: a countdown, a warning about losing access, one code for one
// product. None of that is true any more. TechDesk is free forever and this
// is where a shop that wants more buys it -- once from free to Business, and
// again, later, from Business to Enterprise, on the same PIN.
//
// So the whole transaction is on one screen on purpose: what they would be
// getting, what it costs to ask, their PIN, and the box to type the code
// into. A shop that has to leave this screen to find out how to pay is a
// shop that closes it.

function humanDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function ActivationModal({ onClose }) {
  const t = useThemeTokens();
  const { pin, tier, unlocks, verifyCode } = useLicense();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);

  const meta = TIER_META[tier];
  const next = meta.upgradeTo;
  const nextMeta = next ? TIER_META[next] : null;
  const gains = next ? addedBy(CAPABILITIES[tier], CAPABILITIES[next]) : [];

  async function handleVerify() {
    setChecking(true);
    setError("");
    setNote("");
    const res = await verifyCode(code);
    setChecking(false);

    if (!res.ok) {
      setError("That code doesn't match this PIN. Check it against the PIN below, then call us.");
      return;
    }
    if (!res.applied) {
      // A real code, for something they already have. Not a failure, and it
      // must not be dressed up as one -- the shop did nothing wrong.
      setNote(`That code is already active. You're on ${TIER_META[res.tier].label}.`);
      setCode("");
      return;
    }
    setNote(`Done. ${TIER_META[res.tier].label} is unlocked on this computer.`);
    setCode("");
  }

  function copyPin() {
    if (!pin) return;
    navigator.clipboard?.writeText(pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6 overflow-y-auto">
      <div className={`w-full max-w-sm rounded-2xl p-6 my-auto ${t.cardBg}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className={`w-5 h-5 ${next ? t.textPrimary : "text-emerald-500"}`} />
            <h2 className={`text-lg font-bold ${t.textPrimary}`}>
              {next ? `Upgrade to ${nextMeta.label}` : "Fully unlocked"}
            </h2>
          </div>
          <button onClick={onClose} className={t.textMuted} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className={`text-sm mb-4 ${t.textMuted}`}>
          You're on <span className="font-medium">{meta.label}</span>.
        </p>

        {next ? (
          <>
            {gains.length > 0 && (
              <ul className={`text-sm mb-4 space-y-1.5 ${t.textSecondary}`}>
                {gains.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className={`text-sm mb-4 ${t.textSecondary}`}>
              One payment, not a subscription. Your records stay exactly where they are — nothing to
              download, nothing to reinstall.
            </p>
          </>
        ) : (
          <p className={`text-sm mb-4 ${t.textSecondary}`}>
            Every feature is open on this computer. Thank you for supporting TechDesk.
          </p>
        )}

        <div className={`rounded-xl p-4 mb-4 ${t.insetBg}`}>
          <div className={`text-xs mb-1 ${t.textMuted}`}>Your PIN — read this out when you pay</div>
          <div className="flex items-center justify-between">
            <span className={`text-2xl font-bold tracking-widest ${t.textPrimary}`}>
              {pin || "\u2014\u2014\u2014\u2014\u2014\u2014"}
            </span>
            <button
              onClick={copyPin}
              disabled={!pin}
              className={`p-2 rounded-lg disabled:opacity-40 ${t.pillBg}`}
              aria-label="Copy PIN"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* The box stays even at the top tier: a shop may be re-entering a
            code after moving to a new computer, and a screen that has taken
            the box away leaves them with nowhere to type it. */}
        <div className="mb-4">
          <label htmlFor="activation-code" className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>
            Activation code
          </label>
          <input
            id="activation-code"
            value={code}
            onChange={(e) => {
              setCode(formatCode(e.target.value));
              setError("");
              setNote("");
            }}
            placeholder="XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none uppercase tracking-wider ${t.inputBg}`}
          />
          {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
          {note && <p className="text-xs text-emerald-600 mt-1.5">{note}</p>}
        </div>

        <button
          onClick={handleVerify}
          disabled={!code || checking}
          className={`w-full py-3 rounded-xl font-semibold mb-5 disabled:opacity-50 ${
            t.dark ? "bg-white text-black" : "bg-slate-900 text-white"
          }`}
        >
          {checking ? "Checking..." : "Unlock"}
        </button>

        {unlocks.length > 0 && (
          <div className={`text-xs mb-4 ${t.textMuted}`}>
            {unlocks.map((u) => (
              <div key={u.tier}>
                {TIER_META[u.tier]?.label || u.tier} unlocked {humanDate(u.at)}
              </div>
            ))}
          </div>
        )}

        <div className={`text-xs mb-2 ${t.textMuted}`}>To get a code, or if one won't work:</div>
        <div className="flex flex-col gap-2">
          <a
            href={sitePage("plans.html")}
            target="_blank"
            rel="noreferrer"
            className={`flex items-center gap-2 text-sm font-medium ${t.textPrimary}`}
          >
            <Globe className="w-4 h-4" /> {siteLabel("plans.html")}
          </a>
          <a href="tel:+2348076911614" className={`flex items-center gap-2 text-sm ${t.textSecondary}`}>
            <Phone className="w-4 h-4" /> +234 807 691 1614
          </a>
          <a href="mailto:seun85148@gmail.com" className={`flex items-center gap-2 text-sm ${t.textSecondary}`}>
            <Mail className="w-4 h-4" /> seun85148@gmail.com
          </a>
        </div>
      </div>
    </div>
  );
}
