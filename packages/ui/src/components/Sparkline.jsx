import React, { useId } from "react";

/**
 * A tiny trend line that draws itself in. `data` is oldest first; a flat or
 * empty series still draws, as a line along the bottom, so a quiet week looks
 * quiet rather than broken.
 */
export default function Sparkline({ data = [], color = "currentColor", className = "" }) {
  const id = useId().replace(/:/g, "");
  const w = 100;
  const h = 32;
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = (data.length ? data : [0, 0]).map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const [lx, ly] = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`sg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg${id})`} className="td-spark-area" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength="1" className="td-spark-line" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="2.6" fill={color} className="td-spark-dot" />
    </svg>
  );
}
