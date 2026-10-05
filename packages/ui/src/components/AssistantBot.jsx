import React from "react";

// The assistant's face: a small friendly robot -- a rounded head with an
// antenna, a dark screen for a face, two glowing eyes that blink now and
// then, and a smile. Drawn in SVG so it stays sharp at any size; the blink
// and the antenna's glow stop for anyone who has asked for less motion.
export default function AssistantBot({ size = 28, mood = "happy", listening = false, className = "" }) {
  const eye = listening ? "#fca5a5" : "#67e8f9";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={`td-bot ${className}`} aria-hidden="true">
      <style>{`
        @keyframes tdBlink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
        @keyframes tdGlow { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
        .td-bot .td-eye { transform-box: fill-box; transform-origin: center; animation: tdBlink 4.5s infinite; }
        .td-bot .td-antenna { animation: tdGlow 2.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .td-bot .td-eye, .td-bot .td-antenna { animation: none; } }
      `}</style>
      {/* antenna */}
      <line x1="24" y1="5.5" x2="24" y2="11" stroke="#e0e7ff" strokeWidth="2.2" strokeLinecap="round" />
      <circle className="td-antenna" cx="24" cy="5" r="3" fill={listening ? "#f87171" : "#fbbf24"} />
      {/* ears */}
      <rect x="4" y="20" width="4" height="9" rx="2" fill="#c7d2fe" />
      <rect x="40" y="20" width="4" height="9" rx="2" fill="#c7d2fe" />
      {/* head */}
      <rect x="7.5" y="11" width="33" height="27" rx="10" fill="#ffffff" />
      {/* face screen */}
      <rect x="11.5" y="15.5" width="25" height="17.5" rx="7" fill="#1e1b4b" />
      {/* eyes */}
      <ellipse className="td-eye" cx="19" cy="23" rx="2.7" ry="3.1" fill={eye} />
      <ellipse className="td-eye" cx="29" cy="23" rx="2.7" ry="3.1" fill={eye} />
      {/* mouth */}
      {mood === "happy" ? (
        <path d="M19.5 28 Q24 31.5 28.5 28" stroke={eye} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      ) : (
        <rect x="21" y="28" width="6" height="1.8" rx=".9" fill={eye} />
      )}
      {/* neck hint */}
      <rect x="19" y="38" width="10" height="4" rx="2" fill="#c7d2fe" />
    </svg>
  );
}
