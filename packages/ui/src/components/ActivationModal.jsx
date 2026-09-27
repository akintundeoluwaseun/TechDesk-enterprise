import React, { useState } from "react";
import { X, ShieldCheck, Phone, Mail, Globe, Copy, Check, ChevronDown } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { useLicense } from "../lib/LicenseContext";
import { CAPABILITIES, TIER_META, sitePage, siteLabel } from "@techdesk/editions";
import { addedBy } from "../lib/featureLabels";
import { formatCode } from "../lib/activationCode";

// The licence screen.
//
// It used to be the activation screen for a 7-day trial. The countdown went
// long ago -- TechDesk is free forever -- but the SHAPE of an activation
// screen stayed: the PIN in the biggest type on the page under "read this out
// when you pay", and a black Unlock button under an empty code box.
//
// Which was right for a shop that has not paid, and wrong for every shop that
// has. A customer who had bought Enterprise opened this and was shown a
// payment PIN and a demand for a code, with the one line telling them they
// were already on Enterprise set small and grey above it. They read it as
// "you still need to activate", because that is what it looks like.
//
// So the screen now leads with what you HAVE. Paid and fully unlocked: it
// says so, and the code box goes away behind "Moved to a new computer?".
// Paid with something above you: it says what you are on, then offers the
// upgrade. Only a shop that has not paid gets the PIN and the code box in
// front of them, because for them that is the whole point of the screen.

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

  // A shop that has paid is not here to activate. The PIN and the code box
  // are what they need when they are BUYING -- so they lead the screen on the
  // free tier and step back behind a line of text on every other one.
  const paid = tier !== "free";
  const [showCode, setShowCode] = useState(!paid);
  const newest = unlocks.length ? unlocks[unlocks.length - 1] : null;

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
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck
              className={`w-5 h-5 shrink-0 ${paid ? "text-emerald-500" : t.textPrimary}`}
            />
            {/* What you HAVE, in the biggest type on the screen. This used to
                be the PIN, which is what made a paid shop think it still had
                to activate. */}
            <h2 className={`text-lg font-bold ${t.textPrimary}`}>
              {paid ? `${meta.label} is on` : "Unlock more of TechDesk"}
            </h2>
          </div>
          <button onClick={onClose} className={`${t.textMuted} shrink-0`} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {paid ? (
          <p className={`text-sm mb-4 ${t.textSecondary}`}>
            {next
              ? `Every ${meta.label.replace("TechDesk ", "").toLowerCase()} feature is open on this computer.`
              : "Every feature is open on this computer. Thank you for supporting TechDesk."}
            {newest ? ` Unlocked ${humanDate(newest.at)}.` : ""}
          </p>
        ) : (
          <p className={`text-sm mb-4 ${t.textSecondary}`}>
            You&rsquo;re on {meta.label} &mdash; a whole working shop, free, forever. This is where
            you open the rest.
          </p>
        )}

        {next && (
          <div className={`rounded-xl p-4 mb-4 ${t.insetBg}`}>
            <div className={`font-semibold mb-2 ${t.textPrimary}`}>
              Upgrade to {nextMeta.label}
            </div>
            {gains.length > 0 && (
              <ul className={`text-sm space-y-1.5 ${t.textSecondary}`}>
                {gains.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className={`text-xs mt-3 ${t.textMuted}`}>
              One payment, not a subscription. Your records stay exactly where they are &mdash;
              nothing to download, nothing to reinstall.
            </p>
          </div>
        )}

        {/* The way in for a shop that has paid and has a reason to be here:
            a new computer, or the code for the tier above. Shut by default,
            because an open code box on a paid install is the thing that read
            as "you have not activated yet". */}
        {!showCode && (
          <button
            onClick={() => setShowCode(true)}
            className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-sm font-medium mb-4 ${t.pillBg}`}
          >
            <span className={t.textPrimary}>
              {next ? "I have an upgrade code" : "Moved to a new computer?"}
            </span>
            <ChevronDown className={`w-4 h-4 shrink-0 ${t.textMuted}`} aria-hidden="true" />
          </button>
        )}

        {showCode && (
          <>
            <div className={`rounded-xl p-4 mb-4 ${t.insetBg}`}>
              <div className={`text-xs mb-1 ${t.textMuted}`}>
                Your PIN &mdash; read this out when you pay
              </div>
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

            <div className="mb-4">
              <label
                htmlFor="activation-code"
                className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}
              >
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
          </>
        )}

        {/* Only once there is a progression to show. A single line repeating
            the date already in the paragraph above is noise; two lines
            saying Business then Enterprise is the story of the account. */}
        {unlocks.length > 1 && (
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
          <a href="mailto:techdeskapp@gmail.com" className={`flex items-center gap-2 text-sm ${t.textSecondary}`}>
            <Mail className="w-4 h-4" /> techdeskapp@gmail.com
          </a>
        </div>
      </div>
    </div>
  );
}
