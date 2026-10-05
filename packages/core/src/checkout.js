// Paying for an upgrade, from the browser straight through to Flutterwave.
//
// Two calls, with Flutterwave's own checkout widget in between them:
//
//   1. startOrder({ pin, tier, contact })  -- the price comes back from the
//      server, read out of activation_prices; nothing here can edit what
//      gets charged. Returns what the widget needs to open: a reference,
//      an amount and currency to show, and Flutterwave's public key.
//   2. claimCode(txRef)  -- after the widget reports success, this asks for
//      the code that payment bought. It asks Flutterwave itself if the
//      webhook has not arrived yet, so a slow webhook never strands a shop
//      that has already paid, and refreshing never consumes a second code.
//
// The code itself is never trusted just because Flutterwave said "success"
// in the browser -- claimCode only hands one over once the server has
// checked with Flutterwave directly. What it returns is verified the same
// way a WhatsApp-relayed code always was: entirely offline, by
// LicenseContext's verifyCode(). This only gets a shop from "I paid" to
// "here is the code", nothing more.

import { featureOn, pausedResult } from "./appControl";

const SUPABASE_URL = "https://wuwerzyydtvargvqjufb.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_aiiQjedgBx4Tq-NX_jIGtw_ekAYgxV_";

async function fnFetch(fn, body) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "offline", message: "Couldn't reach TechDesk. Check your internet and try again." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error, message: data?.message || "Something went wrong. Try again." };
  }
  return data;
}

export const checkout = {
  /** The web app can always try; there is no shell that might be missing. */
  available: () => true,

  /**
   * Starts an order for this device's own PIN. Returns what Flutterwave's
   * checkout widget needs to open, never the price the caller asked for --
   * that would let it be edited before it reaches the server.
   */
  async startOrder({ pin, tier, product = "plan", quantity, hqIdentity, contact, promo }) {
    if (!featureOn("upgrade")) return pausedResult("upgrade");
    return fnFetch("activation-order", { pin, tier, product, quantity, hqIdentity, contact, promo: promo || undefined });
  },

  /**
   * What this PIN has paid for, and until when -- plans are yearly, and the
   * server's licence is what says for how long. {ok, found, tier, expiresAt}.
   */
  /**
   * A one-time code (BUS-/ENT-/UPG-...), checked and used up online; the
   * year it buys lands on this PIN's licence. {ok, tier, expiresAt} or
   * {ok:false, error, message}.
   */
  async redeemOneTimeCode(code, pin, businessCode = null) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/redeem_one_time_code`, {
        method: "POST",
        headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_code: String(code), p_pin: String(pin), p_business_code: businessCode || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || typeof data !== "object") return { ok: false, error: "server", message: "Couldn't check that code just now. Try again in a moment." };
      return data;
    } catch {
      return { ok: false, error: "offline", message: "Connect to the internet to use this code. It only needs to be online once." };
    }
  },

  /**
   * A code made for this PIN (Business, Enterprise or Upgrade), typed in:
   * the server starts the year the first time it hears about it.
   */
  async redeemPinCode(code, pin, businessCode = null) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/redeem_pin_code`, {
        method: "POST",
        headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_code: String(code), p_pin: String(pin), p_business_code: businessCode || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || typeof data !== "object") return { ok: false, error: "server", message: "Couldn't check that code just now. Try again in a moment." };
      return data;
    } catch {
      return { ok: false, error: "offline", message: "Connect to the internet to use this code. It only needs to be online once." };
    }
  },

  /** proofs: codes this device holds that only the server can check (one-time and Upgrade codes). */
  async licenceStatus(pin, proofs = []) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/licence_status`, {
        method: "POST",
        headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(proofs?.length ? { p_pin: String(pin), p_proof: proofs.map(String) } : { p_pin: String(pin) }),
      });
      if (!res.ok) return { ok: false };
      const data = await res.json();
      return data && typeof data === "object" ? data : { ok: false };
    } catch {
      return { ok: false, error: "offline" };
    }
  },

  /**
   * While payments are off (the owner is still testing), Upgrade is free: the
   * server gives this PIN a trial licence for the plan, which the owner's
   * switch ends when payments go live. No code comes back -- the licence is
   * the whole unlock. {ok, tier, expiresAt, trial} or {ok:false, reason}.
   */
  async trialUnlock(pin, tier) {
    if (!featureOn("upgrade")) return pausedResult("upgrade");
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/trial_unlock`, {
        method: "POST",
        headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_pin: String(pin), p_tier: tier }),
      });
      if (!res.ok) return { ok: false, reason: "server_error" };
      const data = await res.json();
      return data && typeof data === "object" ? data : { ok: false, reason: "server_error" };
    } catch {
      return { ok: false, reason: "offline" };
    }
  },

  /** Whether a promo code is good right now, and for how much off: {valid, code, percent}. */
  async promoCheck(code) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/promo_check`, {
        method: "POST",
        headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_code: String(code || "") }),
      });
      if (!res.ok) return { valid: false, error: "server_error" };
      const data = await res.json();
      return data && typeof data === "object" ? data : { valid: false };
    } catch {
      return { valid: false, error: "offline" };
    }
  },

  /** Today's prices, from the server -- never hard-coded where a shop pays. */
  async prices() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/price_list?select=product,amount,currency,label&active=eq.true`, {
        headers: { apikey: PUBLISHABLE_KEY },
      });
      if (!res.ok) return null;
      const rows = await res.json();
      return Object.fromEntries((rows || []).map((r) => [r.product, { amount: Number(r.amount), currency: r.currency, label: r.label }]));
    } catch {
      return null;
    }
  },

  /**
   * Asks whether txRef has been paid, and releases the code for it if so.
   * Safe to call again: an order already released hands back the same code
   * rather than consuming another one.
   */
  async claimCode(txRef) {
    return fnFetch("activation-claim", { txRef });
  },

  /**
   * A Google Play purchase (Play Store build): the server checks it with
   * Google and starts the year. {ok, kind, tier, expiresAt} or {ok:false, error, message}.
   */
  async playVerify(pin, productId, purchaseToken) {
    return fnFetch("play-verify", { pin: String(pin), productId, purchaseToken });
  },
};
