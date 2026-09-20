import React from "react";
import { Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { useThemeTokens } from "../lib/ThemeContext";
import { useTier } from "../lib/useTier";
import { unlockedBy } from "../lib/tier";
import { TIER_META } from "@techdesk/editions";

// A feature this shop has not paid for.
//
// Two rules, both learned from being on the other side of software like this:
//
// It says what the feature IS, not just that it is locked. "Upgrade to use
// this" tells a shop nothing they can decide on. They are standing at a
// counter; if they cannot tell in two seconds what they would be buying, they
// close it and never look again.
//
// And it never blocks work already in progress. A lock belongs on a door the
// shop has not walked through yet -- never in the middle of a sale, never
// over records they already have.

/** The plain sentence a locked control shows. */
export function upgradeLine(feature) {
  const tier = unlockedBy(feature);
  const label = tier && TIER_META[tier] ? TIER_META[tier].label : "a paid plan";
  return `Upgrade to ${label} to use this`;
}

/**
 * Wraps a whole panel. Renders the children when the shop has the feature,
 * and an explanation with a way forward when they do not.
 */
export default function UpgradeLock({ feature, title, children, what }) {
  const { can } = useTier();
  const t = useThemeTokens();
  if (can(feature)) return children;

  const tier = unlockedBy(feature);
  const label = tier && TIER_META[tier] ? TIER_META[tier].label : "a paid plan";

  return (
    <div className={`rounded-xl px-5 py-6 ${t.insetBg}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${t.textMuted}`}>
          <Lock size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold ${t.textPrimary}`}>{title}</div>
          {/* What they would be getting, in the shop's own words. */}
          {what ? <p className={`mt-1 text-sm ${t.textSecondary}`}>{what}</p> : null}
          <p className={`mt-3 text-sm ${t.textSecondary}`}>
            This is part of <span className="font-medium">{label}</span>.
          </p>
          <Link
            to="/settings?tab=developer"
            className="inline-block mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
          >
            How to upgrade
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * For a single control rather than a panel -- a Save button, a Share button.
 *
 * Shown, not hidden. A button that disappears looks like a bug or a lost
 * feature; a button that is visibly locked is an offer, and it is the only
 * way a free shop ever finds out the paid version does something they want.
 */
export function LockedButton({ feature, className = "", children, onClick, title, ...rest }) {
  const { can } = useTier();
  const t = useThemeTokens();
  if (can(feature)) {
    return (
      <button className={className} onClick={onClick} title={title} {...rest}>
        {children}
      </button>
    );
  }
  return (
    <button
      className={`${className} opacity-60 cursor-not-allowed`}
      title={upgradeLine(feature)}
      aria-label={`${title || ""} — ${upgradeLine(feature)}`.trim()}
      onClick={(e) => e.preventDefault()}
      {...rest}
    >
      <span className={`inline-flex items-center gap-1 ${t.textMuted}`}>
        <Lock size={14} />
        {children}
      </span>
    </button>
  );
}
