import React, { useId } from "react";

// The TechDesk mark -- the same one as the website, the app icon and the
// installers (brand/techdesk.svg): a T whose stem is the back of a D, white
// on indigo-to-sky. Drawn inline so it's sharp at any size and needs no file.
export default function BrandMark({ className = "w-6 h-6", title }) {
  const id = `td-g-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      <g transform="translate(2.5 0)">
        <rect x="11" y="14" width="27" height="7.5" rx="3.75" fill="#fff" />
        <rect x="20.75" y="14" width="7.5" height="36" rx="3.75" fill="#fff" />
        <path d="M28 25.5h4.5a10.25 10.25 0 0 1 0 20.5H28" fill="none" stroke="#fff" strokeWidth="7.5" strokeLinejoin="round" />
        <circle cx="47" cy="17.75" r="3.75" fill="#7dd3fc" />
      </g>
    </svg>
  );
}
