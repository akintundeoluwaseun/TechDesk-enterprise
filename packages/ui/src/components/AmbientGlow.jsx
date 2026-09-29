import React from "react";

// Two soft pools of colour drifting slowly behind the pages -- enough that the
// space between cards reads as lit rather than blank. Behind everything, never
// in the way of a click, and still (not drifting) for reduced motion.
export default function AmbientGlow({ dark }) {
  const a = dark ? "rgba(99,102,241,.16)" : "rgba(99,102,241,.10)";
  const b = dark ? "rgba(14,165,233,.12)" : "rgba(14,165,233,.09)";
  return (
    <div aria-hidden="true" className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="td-drift absolute rounded-full" style={{ width: 720, height: 720, right: -260, top: -320, background: `radial-gradient(circle, ${a}, transparent 62%)` }} />
      <div className="td-drift-2 absolute rounded-full" style={{ width: 620, height: 620, left: "18%", bottom: -360, background: `radial-gradient(circle, ${b}, transparent 62%)` }} />
    </div>
  );
}
