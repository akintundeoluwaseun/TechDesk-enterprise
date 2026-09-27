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
  async startOrder({ pin, tier, contact }) {
    return fnFetch("activation-order", { pin, tier, contact });
  },

  /**
   * Asks whether txRef has been paid, and releases the code for it if so.
   * Safe to call again: an order already released hands back the same code
   * rather than consuming another one.
   */
  async claimCode(txRef) {
    return fnFetch("activation-claim", { txRef });
  },
};
