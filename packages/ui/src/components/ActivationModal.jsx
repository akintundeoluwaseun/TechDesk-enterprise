import React, { useState } from "react";
import { X, ShieldCheck, Phone, Mail, Check, CreditCard, ChevronRight, ArrowLeft } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { useLicense } from "../lib/LicenseContext";
import { useSettings } from "../lib/SettingsContext";
import { CAPABILITIES, TIERS, TIER_META, isUpgrade, tierRank } from "@techdesk/editions";
import { checkout } from "@techdesk/core";
import { addedBy } from "../lib/featureLabels";
import { payWithFlutterwave } from "../lib/flutterwave";
import { useCloseOnBack } from "../lib/useCloseOnBack";

// The licence screen.
//
// A free shop can buy Business, or skip straight to Enterprise -- both are
// real, priced things, not a chain you're forced up one link at a time. That
// used to mean showing both on one long page: the pitch for one tier, the
// pitch for the other, then a single PIN and a single code box underneath
// both, because there was only ever one "next" tier to activate.
//
// So this is two screens, not one. First a plain choice -- which tier --
// each a short line, nothing more. Then, only once that's picked, that
// tier's own page: what it adds, and the one button to pay for THAT tier.
// Nothing about the tier not chosen shows up on it. A shop that already
// owns everything but Enterprise has one card to pick from, not a choice at
// all in substance, but the same two-screen shape either way -- picking is
// picking, whether there are one or two things to pick from.
//
// There is no PIN shown and no code to type anywhere in here. Paying is a
// card, a bank transfer or a USSD dial, done on this screen, confirmed by
// the server, applied the moment it clears. The PIN still exists one layer
// down (verifyCode() still checks a code against it), because that is also
// how a payment this screen takes gets applied -- just never by a shop
// typing it in by hand.

/**
 * What a tier itself adds, over the tier just below it -- not over whatever
 * tier the shop happens to be on now. Skipping from free straight to
 * Enterprise still means the Business card and the Enterprise card describe
 * two different things, instead of both leading with the same three items
 * Enterprise only has because Business had them first.
 */
function ownFeatures(candidateTier) {
  const rank = tierRank(candidateTier);
  const below = rank > 0 ? CAPABILITIES[TIERS[rank - 1]] : [];
  return addedBy(below, CAPABILITIES[candidateTier]);
}

function humanDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function ActivationModal({ onClose }) {
  const t = useThemeTokens();
  const { pin, tier, unlocks, verifyCode } = useLicense();
  const { settings } = useSettings();
  const [note, setNote] = useState("");

  // Which tier this screen is open on. Null while the shop is still picking.
  const [chosenTier, setChosenTier] = useState(null);

  // Paying online, straight through to Flutterwave.
  //
  //   idle        the button that starts it all
  //   email       collecting where to send the receipt
  //   paying      order started, Flutterwave's widget is open or just closed
  //   confirming  asking the server whether it actually went through
  //   waiting     server says not paid yet -- may just be the webhook lagging
  //   failed      something else went wrong; paying again means starting over
  const [payStep, setPayStep] = useState("idle");
  const [payEmail, setPayEmail] = useState(() => (settings?.email || "").trim());
  const [payError, setPayError] = useState("");
  const [payTxRef, setPayTxRef] = useState(null);

  const meta = TIER_META[tier];
  const paid = tier !== "free";
  const newest = unlocks.length ? unlocks[unlocks.length - 1] : null;
  const upgradeOptions = TIERS.filter((candidate) => isUpgrade(tier, candidate));
  const chosen = chosenTier ? TIER_META[chosenTier] : null;
  const gains = chosenTier ? addedBy(CAPABILITIES[tier], CAPABILITIES[chosenTier]) : [];

  function resetPay() {
    setPayStep("idle");
    setPayError("");
    setPayTxRef(null);
  }

  function pick(candidate) {
    setChosenTier(candidate);
    resetPay();
  }

  function backToPlans() {
    setChosenTier(null);
    resetPay();
  }

  // Two back stops, not one: from a chosen tier's own page, back is the same
  // as tapping "back to plans" below; only from the plan picker does it
  // actually close this screen.
  useCloseOnBack(true, onClose);
  useCloseOnBack(chosenTier !== null, backToPlans);

  async function applyClaimedCode(claimedCode, claimedTier, txRef) {
    const res = await verifyCode(claimedCode);
    if (!res.ok || !res.applied) {
      // A server-issued code always verifies against this device's own PIN --
      // this is the "should never happen" backstop, not the normal path, so
      // a shop that really has paid is never just told to go away.
      setPayError(
        `Payment went through, but this device couldn't apply it. ` +
        `Contact us with this reference so we can sort it out: ${txRef || ""}`,
      );
      setPayTxRef(txRef);
      setPayStep("failed");
      return;
    }
    setNote(`Done. ${TIER_META[claimedTier]?.label || claimedTier} is unlocked on this computer.`);
    setChosenTier(null);
    resetPay();
  }

  async function claim(txRef) {
    setPayStep("confirming");
    const res = await checkout.claimCode(txRef);
    if (!res.ok) {
      setPayTxRef(txRef);
      if (res.error === "not_paid") {
        setPayError("We haven't seen the payment yet. If you completed it, give it a moment and try again.");
        setPayStep("waiting");
      } else {
        setPayError(res.message || "Couldn't confirm that payment. Try again, or contact us.");
        setPayStep("failed");
      }
      return;
    }
    await applyClaimedCode(res.code, res.tier, txRef);
  }

  async function startPayment() {
    setPayError("");
    if (!pin) {
      setPayError("Still preparing this device. Wait a moment and try again.");
      return;
    }
    const trimmedEmail = payEmail.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setPayError("Enter an email for the receipt first.");
      return;
    }
    setPayStep("paying");
    const order = await checkout.startOrder({ pin, tier: chosenTier, contact: trimmedEmail });
    if (!order.ok) {
      setPayError(order.message || "Couldn't start that order. Try again.");
      setPayStep("failed");
      return;
    }
    setPayTxRef(order.txRef);
    await payWithFlutterwave({ order, email: trimmedEmail, title: chosen?.label });
    await claim(order.txRef);
  }

  return (
    <div className="td-overlay fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6 overflow-y-auto">
      <div className={`w-full max-w-sm rounded-2xl p-6 my-auto ${t.cardBg}`}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            {chosenTier ? (
              <button
                onClick={backToPlans}
                className={`${t.textMuted} shrink-0`}
                aria-label="Back to plans"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <ShieldCheck
                className={`w-5 h-5 shrink-0 ${paid ? "text-emerald-500" : t.textPrimary}`}
              />
            )}
            <h2 className={`text-lg font-bold ${t.textPrimary}`}>
              {chosenTier
                ? `Upgrade to ${chosen.label}`
                : paid
                ? `${meta.label} is on`
                : "Unlock more of TechDesk"}
            </h2>
          </div>
          <button onClick={onClose} className={`${t.textMuted} shrink-0`} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!chosenTier && (
          paid ? (
            <p className={`text-sm mb-4 ${t.textSecondary}`}>
              {upgradeOptions.length > 0
                ? `Every ${meta.label.replace("TechDesk ", "").toLowerCase()} feature is open on this computer.`
                : "Every feature is open on this computer. Thank you for supporting TechDesk."}
              {newest ? ` Unlocked ${humanDate(newest.at)}.` : ""}
            </p>
          ) : (
            <p className={`text-sm mb-4 ${t.textSecondary}`}>
              You&rsquo;re on {meta.label} &mdash; a whole working shop, free, forever. This is
              where you open the rest.
            </p>
          )
        )}

        {/* The choice, plain: pick a tier, nothing else on this screen. What
            each one adds lives on ITS OWN page, one tap away, not stacked
            here underneath the choice itself. */}
        {!chosenTier && upgradeOptions.map((candidate) => {
          const candidateMeta = TIER_META[candidate];
          const preview = ownFeatures(candidate).slice(0, 3).join(", ");
          return (
            <button
              key={candidate}
              onClick={() => pick(candidate)}
              className={`w-full flex items-center justify-between gap-3 text-left px-4 py-3.5 rounded-xl mb-3 ${t.insetBg}`}
            >
              <span className="min-w-0">
                <span className={`block font-semibold ${t.textPrimary}`}>
                  Upgrade to {candidateMeta.label}
                </span>
                {preview && (
                  <span className={`block text-xs mt-0.5 truncate ${t.textMuted}`}>{preview}</span>
                )}
              </span>
              <ChevronRight className={`w-4 h-4 shrink-0 ${t.textMuted}`} aria-hidden="true" />
            </button>
          );
        })}

        {/* Everything below is that one tier's own page -- what it adds, then
            the one way to pay for it. */}
        {chosenTier && (
          <>
            {gains.length > 0 && (
              <div className={`rounded-xl p-4 mb-4 ${t.insetBg}`}>
                <ul className={`text-sm space-y-1.5 ${t.textSecondary}`}>
                  {gains.map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <p className={`text-xs mt-3 ${t.textMuted}`}>
                  One payment, not a subscription. Your records stay exactly where they are &mdash;
                  nothing to download, nothing to reinstall.
                </p>
              </div>
            )}

            {payStep === "idle" && (
              <button
                onClick={() => setPayStep("email")}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold mb-4 ${
                  t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
                }`}
              >
                <CreditCard className="w-4 h-4" /> Pay with card, bank transfer or USSD
              </button>
            )}

            {payStep === "email" && (
              <div className={`rounded-xl p-4 mb-4 ${t.insetBg}`}>
                <label htmlFor="pay-email" className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>
                  Email for the receipt
                </label>
                <input
                  id="pay-email"
                  type="email"
                  value={payEmail}
                  onChange={(e) => { setPayEmail(e.target.value); setPayError(""); }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none mb-3 ${t.inputBg}`}
                />
                {payError && <p className="text-xs text-red-500 mb-3">{payError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={startPayment}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${
                      t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
                    }`}
                  >
                    Continue to payment
                  </button>
                  <button
                    onClick={resetPay}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium ${t.pillBg}`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {(payStep === "paying" || payStep === "confirming") && (
              <div className={`rounded-xl p-4 mb-4 text-sm ${t.insetBg} ${t.textSecondary}`}>
                {payStep === "paying" ? "Opening secure checkout…" : "Confirming your payment…"}
              </div>
            )}

            {(payStep === "waiting" || payStep === "failed") && (
              <div className={`rounded-xl p-4 mb-4 ${t.insetBg}`}>
                <p className="text-sm text-red-500 mb-1">{payError}</p>
                {payTxRef && (
                  <p className={`text-xs mb-3 ${t.textMuted}`}>Reference: {payTxRef}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => (payStep === "waiting" ? claim(payTxRef) : setPayStep("email"))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${
                      t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
                    }`}
                  >
                    {payStep === "waiting" ? "Check again" : "Try again"}
                  </button>
                  <button onClick={resetPay} className={`px-4 py-2.5 rounded-xl text-sm font-medium ${t.pillBg}`}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {note && <p className={`text-sm text-emerald-600 mb-4`}>{note}</p>}

        {/* Only once there is a progression to show, and only on the plans
            screen -- a single tier's own page is not the place to recap the
            whole account's history. */}
        {!chosenTier && unlocks.length > 1 && (
          <div className={`text-xs mb-4 ${t.textMuted}`}>
            {unlocks.map((u) => (
              <div key={u.tier}>
                {TIER_META[u.tier]?.label || u.tier} unlocked {humanDate(u.at)}
              </div>
            ))}
          </div>
        )}

        <div className={`text-xs mb-2 ${t.textMuted}`}>
          {paid && upgradeOptions.length === 0
            ? "Moved to a new computer, or need help?"
            : "Paid already and it hasn't unlocked, or need help?"}
        </div>
        <div className="flex flex-col gap-2">
          <a href="tel:+2348076911614" className={`flex items-center gap-2 text-sm font-medium ${t.textPrimary}`}>
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
