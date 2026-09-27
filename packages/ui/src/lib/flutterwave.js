// Flutterwave's inline checkout widget, loaded on demand.
//
// It is a script tag, not an npm package -- Flutterwave serves the current
// build from their own CDN, and pinning a copy here would drift from
// whatever their hosted checkout actually expects. Loaded once and cached,
// so opening the upgrade screen twice does not fetch it twice.

let loading = null;

function loadScript() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window to open a checkout in."));
  if (window.FlutterwaveCheckout) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.flutterwave.com/v3.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the payment page. Check your internet and try again."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Opens Flutterwave's checkout for an order already started server-side --
 * `order` is startOrder()'s own response, so the amount and reference on
 * screen are always the ones the server actually charges for.
 *
 * Resolves once the widget closes, however it closed. This never reports
 * "paid" itself: the widget's own callback is what Flutterwave's JS says
 * happened in this browser, and the only thing that actually counts is the
 * server asking Flutterwave directly afterwards, via checkout.claimCode().
 */
export async function payWithFlutterwave({ order, email, title }) {
  await loadScript();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    window.FlutterwaveCheckout({
      public_key: order.publicKey,
      tx_ref: order.txRef,
      amount: order.amount,
      currency: order.currency,
      payment_options: "card, banktransfer, ussd",
      customer: { email },
      customizations: {
        title: title || "TechDesk",
        description: "Upgrade this device",
      },
      callback: () => finish({ attempted: true }),
      onclose: () => finish({ attempted: false }),
    });
  });
}
