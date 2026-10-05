import React from "react";

/** The assistant's face: the same robot as in the TechDesk app. */
export default function Bot({ size = 28, listening = false }) {
  const eye = listening ? "#fca5a5" : "#67e8f9";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <line x1="24" y1="5.5" x2="24" y2="11" stroke="#e0e7ff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="24" cy="5" r="3" fill={listening ? "#f87171" : "#fbbf24"} />
      <rect x="4" y="20" width="4" height="9" rx="2" fill="#c7d2fe" />
      <rect x="40" y="20" width="4" height="9" rx="2" fill="#c7d2fe" />
      <rect x="7.5" y="11" width="33" height="27" rx="10" fill="#ffffff" />
      <rect x="11.5" y="15.5" width="25" height="17.5" rx="7" fill="#1e1b4b" />
      <ellipse cx="19" cy="23" rx="2.7" ry="3.1" fill={eye} />
      <ellipse cx="29" cy="23" rx="2.7" ry="3.1" fill={eye} />
      <path d="M19.5 28 Q24 31.5 28.5 28" stroke={eye} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <rect x="19" y="38" width="10" height="4" rx="2" fill="#c7d2fe" />
    </svg>
  );
}
