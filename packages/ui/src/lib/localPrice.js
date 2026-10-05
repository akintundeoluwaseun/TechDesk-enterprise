// A Naira price in the shop's own money, for shops outside Nigeria.
//
// The website's /api/local-price works out the country from the connection
// and today's rate; the answer is kept for six hours. TechDesk still charges
// in Naira -- this is only so a shop in Accra or London can read the price.
// In Nigeria, offline, or on any failure, there's nothing to add.
import { useEffect, useState } from "react";
import { SITE_ORIGIN } from "@techdesk/editions";

const KEY = "techdesk_local_price";
const SIX_HOURS = 6 * 60 * 60 * 1000;
let pending = null;

function cached() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && Date.now() - v.at < SIX_HOURS ? v : null;
  } catch {
    return null;
  }
}

export function loadLocalPrice(fetchImpl = typeof fetch !== "undefined" ? fetch : null) {
  const hit = cached();
  if (hit) return Promise.resolve(hit);
  if (!fetchImpl) return Promise.resolve(null);
  if (!pending) {
    pending = fetchImpl(`${SITE_ORIGIN}/api/local-price`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        const v = p && p.currency && p.rate > 0 ? { currency: p.currency, rate: Number(p.rate), at: Date.now() } : null;
        if (v) try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* fine */ }
        return v;
      })
      .catch(() => null)
      .finally(() => { pending = null; });
  }
  return pending;
}

/** "$6.50" for ₦10,000 in the US; null in Nigeria or when unknown. */
export function formatLocal(naira, p) {
  if (!p || p.currency === "NGN" || !(p.rate > 0) || !(Number(naira) > 0)) return null;
  const v = Number(naira) * p.rate;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency, maximumFractionDigits: v >= 10 ? 0 : 2 }).format(v);
  } catch {
    return `${p.currency} ${v.toFixed(2)}`;
  }
}

/** local(naira) -> "about $6.50", or "" in Nigeria. */
export function useLocalPrice() {
  const [p, setP] = useState(cached);
  useEffect(() => {
    let live = true;
    loadLocalPrice().then((v) => { if (live && v) setP(v); });
    return () => { live = false; };
  }, []);
  return {
    currency: p?.currency || "NGN",
    local: (naira) => {
      const s = formatLocal(naira, p);
      return s ? `about ${s}` : "";
    },
  };
}
