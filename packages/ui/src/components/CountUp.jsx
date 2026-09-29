import { useEffect, useRef, useState } from "react";

function prefersStill() {
  return typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A number that rolls up to its value instead of just appearing -- and rolls
 * from the old value to the new one when it changes. Lands on the exact value
 * (decimals and all), since only the frames in between are rounded.
 */
export default function CountUp({ value, format = (n) => String(n), duration = 900 }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(() => (prefersStill() ? target : 0));
  const current = useRef(shown);

  useEffect(() => {
    const from = current.current;
    if (from === target || prefersStill()) {
      current.current = target;
      setShown(target);
      return undefined;
    }
    let raf;
    let start;
    const frame = (ts) => {
      if (start === undefined) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const v = p < 1 ? from + (target - from) * (1 - Math.pow(1 - p, 3)) : target;
      current.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return format(shown === target ? target : Math.round(shown));
}
