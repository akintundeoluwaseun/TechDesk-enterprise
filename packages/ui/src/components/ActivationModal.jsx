import React, { useEffect, useState } from "react";
import { X, ShieldCheck, Phone, Mail, Check, CreditCard, ChevronRight, ArrowLeft, RefreshCw, Building2, KeyRound, MessageCircle } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { useLicense } from "../lib/LicenseContext";
import { useSettings } from "../lib/SettingsContext";
import { CAPABILITIES, TIERS, TIER_META, isUpgrade, tierRank } from "@techdesk/editions";
import { checkout } from "@techdesk/core";
import { addedBy } from "../lib/featureLabels";
import { payWithFlutterwave } from "../lib/flutterwave";
import { useCloseOnBack } from "../lib/useCloseOnBack";
import { licenceActive, daysLeft } from "../lib/licenceTerm";
import { PLAY_STORE } from "../lib/store";
import { formatCode } from "../lib/activationCode";
import { platform } from "@techdesk/platform";
import { useLocalPrice } from "../lib/localPrice";

// Shown until the server's price list arrives, and if it never does. The
// checkout itself always charges the server's price, never these.
const FALLBACK_PRICES = {
  business: { amount: 10000 },
  enterprise: { amount: 20000 },
  upgrade_enterprise: { amount: 10000 },
  branch: { amount: 5000 },
};

function naira(n) {
  return `₦${Number(n || 0).toLocaleString("en-NG")}`;
}

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
  const { pin, tier, boughtTier, unlocks, verifyCode, licence, refreshLicence, grantFromServer } = useLicense();
  const [prices, setPrices] = useState(FALLBACK_PRICES);
  // Outside Nigeria, each price also in the shop's own money (charged in Naira).
  const { local } = useLocalPrice();
  const withLocal = (n) => (local(n) ? ` (${local(n)})` : "");
  useEffect(() => {
    let live = true;
    Promise.resolve(checkout.prices?.()).then((p) => { if (live && p && Object.keys(p).length) setPrices({ ...FALLBACK_PRICES, ...p }); });
    return () => { live = false; };
  }, []);

  // What the chosen purchase is: a plan (new or a renewal), or the
  // Business -> Enterprise upgrade, which costs less for the rest of the year.
  const running = licenceActive(licence);
  const left = daysLeft(licence);
  const upgradeOnly = tier === "business";
  function productFor(candidate) {
    return candidate === "enterprise" && upgradeOnly ? "upgrade" : "plan";
  }
  function priceFor(candidate) {
    if (productFor(candidate) === "upgrade") {
      // Only for what is left of the Business year -- the server's quote,
      // the same number the order will charge.
      const quote = licence?.upgrade;
      return quote?.eligible ? Number(quote.amount) : prices.upgrade_enterprise?.amount;
    }
    return prices[candidate]?.amount;
  }
  // The upgrade price shrinks day by day; read today's before showing it.
  useEffect(() => {
    refreshLicence?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Extra head-office branches, for an Enterprise shop.
  const [branchForm, setBranchForm] = useState(false);
  const [branchHq, setBranchHq] = useState("");
  const [branchQty, setBranchQty] = useState(1);
  const { settings } = useSettings();
  const [note, setNote] = useState("");

  // Which tier this screen is open on. Null while the shop is still picking.
  const [chosenTier, setChosenTier] = useState(null);
  // The first screen is two buttons: "Pay online" and "I have a code".
  // Each opens its own page: the three things to pay for, or this device's
  // PIN with a box for the code made for it.
  const [view, setView] = useState("home"); // home | pay | code

  // The Play Store build pays through Google Play instead (capacitorBilling):
  // Google's own prices, Google's own payment sheet, checked by the server.
  const billing = PLAY_STORE ? (() => { try { return platform().billing || null; } catch { return null; } })() : null;
  const [playPrices, setPlayPrices] = useState({});
  const [playBusy, setPlayBusy] = useState(null); // the option being bought
  useEffect(() => {
    if (!billing) return undefined;
    let live = true;
    billing.prices().then((p) => { if (live) setPlayPrices(p || {}); }).catch(() => {});
    return () => { live = false; };
  }, [billing]);

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
  // A promo code from the owner (console → Money → Promo codes). The server
  // works out the discount; this only passes on what was typed.
  const [promo, setPromo] = useState("");
  const [payError, setPayError] = useState("");
  const [payTxRef, setPayTxRef] = useState(null);

  const meta = TIER_META[tier];
  const paid = tier !== "free";
  const newest = unlocks.length ? unlocks[unlocks.length - 1] : null;
  const upgradeOptions = TIERS.filter((candidate) => isUpgrade(tier, candidate));
  // Renewing: the plan this device is on, a year at a time.
  const renewTier = tier !== "free" && licence?.found ? tier : null;
  const [renewing, setRenewing] = useState(false);
  const chosen = chosenTier ? TIER_META[chosenTier] : null;
  const gains = chosenTier ? addedBy(CAPABILITIES[tier], CAPABILITIES[chosenTier]) : [];

  function resetPay() {
    setPayStep("idle");
    setPayError("");
    setPayTxRef(null);
  }

  function pick(candidate, { renew = false } = {}) {
    setChosenTier(candidate);
    setRenewing(renew);
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
  useCloseOnBack(view !== "home" && chosenTier === null && !branchForm, () => setView("home"));
  useCloseOnBack(chosenTier !== null, backToPlans);
  function goBack() {
    if (chosenTier) return backToPlans();
    if (branchForm) { setBranchForm(false); resetPay(); return; }
    setView("home");
  }

  async function applyClaimedCode(claimedCode, claimedTier, txRef, expiresAt) {
    const until = expiresAt ? ` until ${humanDate(expiresAt)}` : "";
    // An extra branch has no code: it lives on the head office, not here.
    if (!claimedCode) {
      setNote(`Done. Your head office can connect more branches${until}.`);
      setBranchForm(false);
      resetPay();
      return;
    }
    const res = await verifyCode(claimedCode);
    // A renewal hands back the code this device already has: nothing new to
    // apply, just a later end date, which refreshLicence picks up.
    if (res.ok && !res.applied) {
      await refreshLicence?.();
      setNote(`Done. ${TIER_META[claimedTier]?.label || claimedTier} renewed${until}.`);
      setChosenTier(null);
      resetPay();
      return;
    }
    if (!res.ok) {
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
    await refreshLicence?.();
    setNote(`Done. ${TIER_META[claimedTier]?.label || claimedTier} is on${until}. Your activation code for PIN ${pin}: ${formatCode(claimedCode)}. Keep it safe.`);
    setView("home");
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
    await applyClaimedCode(res.code, res.tier, txRef, res.expiresAt);
  }

  // Payments still off: the owner is testing, and Upgrade is free (0034).
  const testing = licence?.paymentsLive === false;
  const [trialNote, setTrialNote] = useState("");
  async function upgradeFree() {
    setPayError("");
    if (!pin) {
      setPayError("Still preparing this device. Wait a moment and try again.");
      return;
    }
    setPayStep("paying");
    const res = await checkout.trialUnlock?.(pin, chosenTier);
    if (!res?.ok) {
      setPayError(
        res?.reason === "paused"
          ? res.message
          : res?.reason === "offline"
          ? "Couldn't reach TechDesk. Check your internet and try again."
          : res?.reason === "payments_live"
            ? "Free testing has ended. Upgrading now takes a payment."
            : "Couldn't upgrade just now. Try again.",
      );
      setPayStep("idle");
      await refreshLicence?.();
      return;
    }
    await refreshLicence?.();
    setTrialNote(`You're on ${TIER_META[res.tier]?.label || res.tier}, free while TechDesk is being tested.`);
    setPayStep("idle");
    setChosenTier(null);
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
    const order = branchForm
      ? await checkout.startOrder({ product: "branch", quantity: branchQty, hqIdentity: branchHq.trim(), contact: trimmedEmail })
      : await checkout.startOrder({
          pin,
          tier: chosenTier,
          product: renewing ? "plan" : productFor(chosenTier),
          contact: trimmedEmail,
          promo: promo.trim() || undefined,
        });
    if (!order.ok) {
      setPayError(order.message || "Couldn't start that order. Try again.");
      setPayStep("failed");
      return;
    }
    setPayTxRef(order.txRef);
    await payWithFlutterwave({ order, email: trimmedEmail, title: order.label || chosen?.label });
    await claim(order.txRef);
  }

  // A Google Play purchase -> the server checks it with Google -> the year
  // starts -> it's consumed, so it can be bought again next year.
  async function playActivate(p, { quiet = false } = {}) {
    const res = await checkout.playVerify(pin, p.productId, p.token);
    const out = await grantFromServer(res, `PLAY:${p.token}`);
    if (!out.ok) {
      if (!quiet) setPayError(out.message || "Couldn't switch it on just now. Your purchase is safe: open this screen again in a minute.");
      return false;
    }
    try { await billing.finish(p.token); } catch { /* finished next time this screen opens */ }
    const until = out.expiresAt ? ` until ${humanDate(out.expiresAt)}` : "";
    setNote(`Done. ${TIER_META[out.tier]?.label || out.tier} is on${until}. Thank you!`);
    setView("home");
    return true;
  }
  async function playBuy(kind) {
    setPayError("");
    if (!pin) { setPayError("Still preparing this device. Wait a moment and try again."); return; }
    setPlayBusy(kind);
    try {
      let p;
      try {
        p = await billing.buy(billing.ids[kind], `pin-${pin}`);
      } catch (err) {
        if (!/cancel/i.test(String(err?.message || err))) setPayError("Google Play couldn't finish that. Try again.");
        return;
      }
      if (!p?.token) { setPayError("Google Play couldn't finish that. Try again."); return; }
      if (!p.paid) {
        setNote("Google Play is waiting for your payment. TechDesk switches on as soon as it's paid: open this screen again then.");
        setView("home");
        return;
      }
      await playActivate(p);
    } finally {
      setPlayBusy(null);
    }
  }
  // Bought, but not switched on here yet (no internet at the time, the app
  // closed mid-way): finish it whenever this screen opens.
  useEffect(() => {
    if (!billing || !pin) return;
    billing.unfinished(`pin-${pin}`).then(async (list) => {
      for (const p of list || []) if (p.paid) await playActivate(p, { quiet: true });
    }).catch(() => {});
  }, [billing, pin]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="td-overlay fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6 overflow-y-auto">
      <div className={`w-full max-w-sm rounded-2xl p-6 my-auto ${t.cardBg}`}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            {chosenTier || branchForm || view !== "home" ? (
              <button
                onClick={goBack}
                className={`${t.textMuted} shrink-0`}
                aria-label="Back"
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
                ? renewing ? `Renew ${chosen.label}` : `Upgrade to ${chosen.label}`
                : branchForm
                ? "Add branches"
                : view === "pay"
                ? billing ? "Pay with Google Play" : "Pay online"
                : view === "code"
                ? "Enter your code"
                : paid
                ? `${meta.label} is on`
                : "Unlock more of TechDesk"}
            </h2>
          </div>
          <button onClick={onClose} className={`${t.textMuted} shrink-0`} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!chosenTier && view === "home" && (
          paid ? (
            <p className={`text-sm mb-4 ${t.textSecondary}`}>
              {upgradeOptions.length > 0
                ? `Every ${meta.label.replace("TechDesk ", "").toLowerCase()} feature is open on this computer.`
                : "Every feature is open on this computer. Thank you for supporting TechDesk."}
              {running
                ? ` Your plan runs until ${humanDate(licence.expiresAt)}${left !== null && left <= 30 ? ` — ${left} day${left === 1 ? "" : "s"} left` : ""}.`
                : newest ? ` Unlocked ${humanDate(newest.at)}.` : ""}
            </p>
          ) : (
            <p className={`text-sm mb-4 ${t.textSecondary}`}>
              {licence?.found && !running && boughtTier !== "free"
                ? `Your ${TIER_META[licence.tier]?.label || "plan"} year ended on ${humanDate(licence.expiresAt)}. Renew to switch it back on — your records are all still here.`
                : <>You&rsquo;re on {meta.label} &mdash; a whole working shop, free, forever. This is where you open the rest.</>}
            </p>
          )
        )}

        {/* The first screen: two buttons, nothing else to read. */}
        {!chosenTier && !branchForm && view === "home" && (
          <div className={`grid ${PLAY_STORE && !billing ? "grid-cols-1" : "grid-cols-2"} gap-3 mb-4`}>
            {(!PLAY_STORE || billing) && (
              <button type="button" onClick={() => setView("pay")}
                className={`flex flex-col items-center justify-center gap-2 text-center px-3 py-5 rounded-2xl ${t.insetBg}`}>
                <span className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center"><CreditCard className="w-6 h-6" /></span>
                <span className={`text-sm font-bold ${t.textPrimary}`}>{billing ? "Pay with Google Play" : "Pay online"}</span>
                <span className={`text-[11px] leading-tight ${t.textMuted}`}>{billing ? "Your Google account" : "Card, transfer or USSD"}</span>
              </button>
            )}
            <button type="button" onClick={() => setView("code")}
              className={`flex flex-col items-center justify-center gap-2 text-center px-3 py-5 rounded-2xl ${t.insetBg}`}>
              <span className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center"><KeyRound className="w-6 h-6" /></span>
              <span className={`text-sm font-bold ${t.textPrimary}`}>I have a code</span>
              <span className={`text-[11px] leading-tight ${t.textMuted}`}>Enter the code for your PIN</span>
            </button>
          </div>
        )}

        {/* Pay online: the three things a shop can buy, always in the same
            place. The ones that don't apply to this device say why. */}
        {!chosenTier && !branchForm && view === "pay" && [
          // On Google Play, buying the plan you're on is the renewal: another year on top.
          { id: "business", label: tier === "business" && billing ? "Renew Business" : "Activate Business", price: prices.business?.amount, per: "a year",
            off: tier === "enterprise" ? "You're on Enterprise" : tier === "business" && !billing ? "You're on Business" : null, go: () => (billing ? playBuy("business") : pick("business")) },
          { id: "enterprise", label: tier === "enterprise" && billing ? "Renew Enterprise" : "Activate Enterprise", price: prices.enterprise?.amount, per: "a year",
            off: tier === "enterprise" && !billing ? "You're on Enterprise" : tier === "business" ? "You're on Business: use Upgrade below" : null, go: () => (billing ? playBuy("enterprise") : pick("enterprise")) },
          { id: "upgrade", label: "Upgrade Business → Enterprise", price: tier === "business" && !billing ? priceFor("enterprise") : prices.upgrade_enterprise?.amount, per: "for the rest of your Business year",
            off: tier === "free" ? "For shops already on Business" : tier === "enterprise" ? "You're on Enterprise" : null, go: () => (billing ? playBuy("upgrade") : pick("enterprise")) },
        ].map((o) => (
          <button key={o.id} type="button" onClick={o.go} disabled={!!o.off || !!playBusy}
            className={`w-full flex items-center justify-between gap-3 text-left px-4 py-3.5 rounded-xl mb-3 disabled:opacity-50 ${t.insetBg}`}>
            <span className="min-w-0">
              <span className={`block font-semibold ${t.textPrimary}`}>{o.label}</span>
              <span className={`block text-xs font-semibold mt-0.5 ${t.textSecondary}`}>
                {o.off ? o.off
                  : playBusy === o.id ? "Waiting for Google Play…"
                  : billing ? <>{playPrices[billing.ids[o.id]] || naira(o.price)} {o.per}</>
                  : testing ? "Free while we test" : <>{naira(o.price)}{withLocal(o.price)} {o.per}</>}
              </span>
            </span>
            {!o.off && <ChevronRight className={`w-4 h-4 shrink-0 ${t.textMuted}`} aria-hidden="true" />}
          </button>
        ))}

        {!chosenTier && view === "pay" && billing && payError && <p className="text-xs text-red-500 mb-3">{payError}</p>}

        {!chosenTier && view === "pay" && !billing && !branchForm && renewTier && !testing && (
          <button
            onClick={() => pick(renewTier, { renew: true })}
            className={`w-full flex items-center justify-between gap-3 text-left px-4 py-3.5 rounded-xl mb-3 ${t.insetBg}`}
          >
            <span className="min-w-0">
              <span className={`block font-semibold ${t.textPrimary}`}>Renew {TIER_META[renewTier].label}</span>
              <span className={`block text-xs mt-0.5 ${t.textMuted}`}>
                {naira(prices[renewTier]?.amount)} for another year{running ? `, added on after ${humanDate(licence.expiresAt)}` : ""}
              </span>
            </span>
            <RefreshCw className={`w-4 h-4 shrink-0 ${t.textMuted}`} aria-hidden="true" />
          </button>
        )}

        {!chosenTier && view === "pay" && !billing && tier === "enterprise" && testing && (
          <p className={`text-xs mb-3 ${t.textMuted}`}>
            Head-office branches are unlimited while TechDesk is being tested.
          </p>
        )}

        {!chosenTier && view === "pay" && !billing && tier === "enterprise" && !branchForm && !testing && (
          <button
            onClick={() => { setBranchForm(true); resetPay(); }}
            className={`w-full flex items-center justify-between gap-3 text-left px-4 py-3.5 rounded-xl mb-3 ${t.insetBg}`}
          >
            <span className="min-w-0">
              <span className={`block font-semibold ${t.textPrimary}`}>Add head-office branches</span>
              <span className={`block text-xs mt-0.5 ${t.textMuted}`}>
                2 are included. {naira(prices.branch?.amount)} a year for each one after that.
              </span>
            </span>
            <Building2 className={`w-4 h-4 shrink-0 ${t.textMuted}`} aria-hidden="true" />
          </button>
        )}

        {!chosenTier && branchForm && (
          <div className={`rounded-xl p-4 mb-4 ${t.insetBg}`}>
            <label htmlFor="branch-hq" className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>
              Your head office&rsquo;s email or phone
            </label>
            <input
              id="branch-hq"
              value={branchHq}
              onChange={(e) => { setBranchHq(e.target.value); setPayError(""); }}
              placeholder="hq@yourshop.com or 0803…"
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none mb-3 ${t.inputBg}`}
            />
            <label htmlFor="branch-qty" className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>
              How many extra branches
            </label>
            <div className="flex items-center gap-3 mb-3">
              <input
                id="branch-qty"
                type="number"
                min={1}
                max={50}
                value={branchQty}
                onChange={(e) => setBranchQty(Math.max(1, Math.min(50, Math.trunc(Number(e.target.value) || 1))))}
                className={`w-20 rounded-xl px-3 py-2.5 text-sm outline-none ${t.inputBg}`}
              />
              <span className={`text-sm font-semibold ${t.textPrimary}`}>
                {naira((prices.branch?.amount || 0) * branchQty)} a year
              </span>
            </div>
            {payStep === "idle" && (
              <div className="flex gap-2">
                <button
                  onClick={() => (branchHq.trim() ? setPayStep("email") : setPayError("Enter your head office's email or phone."))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}
                >
                  Continue
                </button>
                <button onClick={() => { setBranchForm(false); resetPay(); }} className={`px-4 py-2.5 rounded-xl text-sm font-medium ${t.pillBg}`}>
                  Cancel
                </button>
              </div>
            )}
            {payStep === "idle" && payError && <p className="text-xs text-red-500 mt-2">{payError}</p>}
          </div>
        )}

        {/* Everything below is that one tier's own page -- what it adds, then
            the one way to pay for it. */}
        {(chosenTier || branchForm) && (
          <>
            {chosenTier && renewing && (
              <div className={`rounded-xl p-4 mb-4 text-sm ${t.insetBg} ${t.textSecondary}`}>
                Another year of {chosen.label} for {naira(prices[chosenTier]?.amount)}
                {running ? `, added on after ${humanDate(licence.expiresAt)} so you lose nothing by renewing early.` : ", starting today."}
              </div>
            )}

            {chosenTier && !renewing && gains.length > 0 && (
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
                  {testing
                    ? "Free while TechDesk is being tested."
                    : productFor(chosenTier) === "upgrade" && !renewing
                      ? `${naira(priceFor(chosenTier))}${withLocal(priceFor(chosenTier))} for the rest of your Business year, then ${naira(prices.enterprise?.amount)} a year.`
                      : `${naira(prices[chosenTier]?.amount)}${withLocal(prices[chosenTier]?.amount)} a year.`}{" "}
                  {local(prices[chosenTier]?.amount) ? "You pay in Naira; your bank converts it. " : ""}
                  Your records stay exactly where they are &mdash; nothing to download, nothing to reinstall.
                </p>
              </div>
            )}

            {chosenTier && testing && !renewing && (payStep === "idle" || payStep === "paying") && (
              <>
                <button
                  onClick={upgradeFree}
                  disabled={payStep === "paying"}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold mb-2 disabled:opacity-60 ${
                    t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
                  }`}
                >
                  <Check className="w-4 h-4" /> {payStep === "paying" ? "Upgrading…" : "Upgrade free while we test"}
                </button>
                <p className={`text-xs mb-4 text-center ${t.textMuted}`}>
                  No payment is taken during testing. Paid plans start later.
                </p>
                {payError && <p className="text-xs text-red-500 mb-3">{payError}</p>}
              </>
            )}

            {chosenTier && !testing && payStep === "idle" && (
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
                {!branchForm && (
                  <>
                    <label htmlFor="pay-promo" className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>
                      Promo code <span className={`font-normal ${t.textMuted}`}>(optional)</span>
                    </label>
                    <input
                      id="pay-promo"
                      type="text"
                      value={promo}
                      onChange={(e) => { setPromo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20)); setPayError(""); }}
                      placeholder="e.g. LAUNCH20"
                      autoComplete="off"
                      className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none mb-3 tracking-wider ${t.inputBg}`}
                    />
                  </>
                )}
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
        {trialNote && !chosenTier && <p className={`text-sm text-emerald-600 mb-4`}>{trialNote}</p>}

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

        {/* I have a code: this device's PIN, and the box for the code made for it. */}
        {!chosenTier && !branchForm && view === "code" && (
          <>
            <div className={`rounded-xl p-4 mb-3 text-center ${t.insetBg}`}>
              <div className={`text-xs font-semibold uppercase tracking-wider ${t.textMuted}`}>Your PIN</div>
              <div className={`font-mono text-3xl font-bold tracking-[0.2em] mt-1 ${t.textPrimary}`}>{pin || "…"}</div>
              <p className={`text-xs mt-2 ${t.textMuted}`}>No code yet? Send this PIN to TechDesk, pay, and we send you the code for it.</p>
              <a href={`https://wa.me/2348076911614?text=${encodeURIComponent(`Hello TechDesk, my PIN is ${pin || ""}. I'd like ${tier === "business" ? "to upgrade to Enterprise" : "an activation code"}.`)}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold px-3 py-1.5 rounded-full bg-emerald-500 text-white">
                <MessageCircle className="w-4 h-4" /> Send PIN on WhatsApp
              </a>
            </div>
            <CodeEntry t={t} pin={pin} showPin={false} open verifyCode={verifyCode} refreshLicence={refreshLicence}
              onApplied={(applied) => { setNote(applied); setView("home"); }} />
          </>
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

/**
 * "Have an activation code?" -- the PIN this device's codes are made for,
 * and a box to type one in. The code is checked on the device against its
 * own table (LicenseContext.verifyCode); nothing is sent anywhere.
 */
// BUS-XXXX-XXXX-XXXX for the one-time codes, XXXX-XXXX-XXXX for a code made for this device.
function shapeCode(typed) {
  const clean = String(typed || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  const m = clean.match(/^(BUS|ENT|UPG)(.*)$/);
  if (m) return [m[1], ...(m[2].slice(0, 12).match(/.{1,4}/g) || [])].join("-");
  return formatCode(clean).slice(0, 14);
}

function CodeEntry({ t, pin, showPin = true, open: startOpen, verifyCode, refreshLicence, onApplied }) {
  const [open, setOpen] = useState(startOpen);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function apply() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await verifyCode(code);
      if (!res.ok) {
        setMsg({ bad: true, text: res.message || "That code doesn't match this device. Check it was made for the PIN shown here." });
        return;
      }
      await refreshLicence?.();
      const label = TIER_META[res.tier]?.label || res.tier;
      const until = res.expiresAt ? ` until ${new Date(res.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}` : "";
      setCode("");
      if (res.applied) {
        onApplied?.(`${label} is on${until}. Thank you!`);
        setMsg({ bad: false, text: `${label} is on${until}.` });
      } else {
        setMsg({ bad: false, text: `That ${label} code is already on this device.` });
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`w-full text-left text-sm font-medium underline underline-offset-2 mb-4 ${t.textSecondary}`}>
        Have an activation code?
      </button>
    );
  }
  return (
    <div className={`rounded-xl p-4 mb-4 ${t.insetBg}`}>
      <div className={`text-sm font-semibold ${t.textPrimary}`}>Activation code</div>
      <p className={`text-xs mt-1 ${t.textSecondary}`}>Type the code TechDesk sent for this PIN. Be online the first time, so your year starts.</p>
      {showPin && <p className={`text-xs mt-2 ${t.textMuted}`}>
        This device&rsquo;s PIN: <span className={`font-mono font-semibold tracking-wider ${t.textPrimary}`}>{pin || "…"}</span>
      </p>}
      <input
        aria-label="Activation code"
        value={code}
        onChange={(e) => { setCode(shapeCode(e.target.value)); setMsg(null); }}
        placeholder="XXXX-XXXX-XXXX"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className={`w-full rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest outline-none mt-2 ${t.inputBg}`}
      />
      {msg && <p className={`text-xs mt-2 ${msg.bad ? "text-red-500" : "text-emerald-500"}`}>{msg.text}</p>}
      <button
        type="button"
        disabled={busy || code.replace(/-/g, "").length < 12 || (/^(BUS|ENT|UPG)/.test(code) && code.replace(/-/g, "").length < 15)}
        onClick={apply}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold mt-3 disabled:opacity-40 ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}
      >
        {busy ? "Checking…" : "Apply code"}
      </button>
    </div>
  );
}
