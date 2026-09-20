import { useEffect, useState, useCallback } from "react";
import { currentTier, onTierChange, can as canNow } from "./tier";

/**
 * The shop's tier, and a can() that re-renders when it changes.
 *
 * The re-render is the point. A shop that pays in the middle of the day
 * should watch the lock come off the button they were looking at, not be told
 * to restart the app -- being asked to restart after paying is the moment
 * they wonder whether it worked.
 */
export function useTier() {
  const [tier, setTier] = useState(currentTier);
  useEffect(() => onTierChange(setTier), []);
  const can = useCallback((feature) => canNow(feature), [tier]);
  return { tier, can };
}
