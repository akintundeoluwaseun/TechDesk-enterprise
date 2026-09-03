import React from "react";

export default function RestrictedOverlay({ onClick }) {
  return (
    <div
      onClick={onClick}
      className="absolute inset-0 z-40 cursor-pointer"
      title="Activate TechDesk to unlock full access"
    />
  );
}
