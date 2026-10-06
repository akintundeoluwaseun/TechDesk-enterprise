// Google Play Billing, for the Play Store build.
//
// TechDesk sells three one-time products (set up in the Play Console):
// Business for a month, Enterprise for a month, and Business -> Enterprise.
// One-time rather than subscriptions because that's what a TechDesk plan is
// -- a month, paid once -- and it keeps the term in one place, the server's
// licence, whichever way a shop paid.
//
// Every purchase carries "pin-<PIN>" so the server can check it was made
// for this device. Purchases aren't acknowledged here: the server does that
// once it has checked the purchase with Google and started the month, and
// only then is the purchase consumed, so the same product can be bought
// again next month.
import { NativePurchases, PURCHASE_TYPE } from "@capgo/native-purchases";

export const PLAY_PRODUCT_IDS = {
  business: "techdesk_business_1m",
  enterprise: "techdesk_enterprise_1m",
  upgrade: "techdesk_upgrade_enterprise",
};

const toPurchase = (t) => ({
  productId: t?.productIdentifier || null,
  token: t?.purchaseToken || null,
  // Android: "1" paid, "0" pending (cash at a shop, bank transfer...).
  paid: String(t?.purchaseState ?? "1") === "1",
  accountId: t?.appAccountToken || null,
});

export const capacitorBilling = {
  ids: PLAY_PRODUCT_IDS,

  async available() {
    try {
      return (await NativePurchases.isBillingSupported()).isBillingSupported === true;
    } catch {
      return false;
    }
  },

  /** {id: localPriceString} for the products Google has, e.g. {techdesk_business_1m: "$5.00"}. */
  async prices() {
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: Object.values(PLAY_PRODUCT_IDS),
      productType: PURCHASE_TYPE.INAPP,
    });
    return Object.fromEntries((products || []).map((p) => [p.identifier, p.priceString]));
  },

  /** Opens Google's payment sheet. Resolves with the purchase, or rejects if the shop backs out. */
  async buy(productId, accountId) {
    const t = await NativePurchases.purchaseProduct({
      productIdentifier: productId,
      productType: PURCHASE_TYPE.INAPP,
      quantity: 1,
      appAccountToken: accountId,
      autoAcknowledgePurchases: false,
    });
    return toPurchase(t);
  },

  /** Purchases Google still holds for this device: bought, but not yet switched on here. */
  async unfinished(accountId) {
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP, appAccountToken: accountId });
    return (purchases || []).map(toPurchase).filter((p) => p.token && Object.values(PLAY_PRODUCT_IDS).includes(p.productId));
  },

  /** After the server has switched it on: lets it be bought again next year. */
  async finish(token) {
    await NativePurchases.consumePurchase({ purchaseToken: token });
  },
};
