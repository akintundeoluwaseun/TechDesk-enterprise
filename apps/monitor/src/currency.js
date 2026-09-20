// What money looks like in TechDesk Monitor.
//
// The branches send up figures, not a currency: a shop's currency is a local
// setting on its own machine and never leaves it. So the owner picks one
// here, once, and it labels everything this app shows. That is right in
// practice -- an owner's branches are in one country and one currency -- and
// it is honest about what Monitor actually knows.
//
// Ten, matching the desktop and web editions. No print-safe spellings: this
// app never makes a PDF, so every symbol it shows is one the phone can draw.

const KEY = "techdesk_monitor_currency";

export const DEFAULT_CURRENCY = "NGN";

export const CURRENCIES = [
  { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  { code: "GHS", symbol: "₵", name: "Ghanaian Cedi" },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "XOF", symbol: "CFA", name: "West African CFA Franc" },
  { code: "EGP", symbol: "E£", name: "Egyptian Pound" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar" },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

/** The chosen code, or naira. Reads storage each time so a change is live. */
export function currencyCode() {
  try {
    const stored = localStorage.getItem(KEY);
    return BY_CODE.has(stored) ? stored : DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export function setCurrency(code) {
  try {
    if (BY_CODE.has(code)) localStorage.setItem(KEY, code);
  } catch {
    // Storage blocked. The picker still works for this session.
  }
}

export function symbol(code = currencyCode()) {
  return (BY_CODE.get(code) || BY_CODE.get(DEFAULT_CURRENCY)).symbol;
}

/** Money for the screen: "₦45,000". */
export function money(amount, code = currencyCode()) {
  return `${symbol(code)}${Number(amount || 0).toLocaleString()}`;
}
