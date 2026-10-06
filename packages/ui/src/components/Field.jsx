import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";

/**
 * A labelled input with its own icon, and a reveal button where it helps.
 *
 * Both places a shop signs in -- the first-run screen and Settings -> Account
 * -- are built from this, so the two cannot drift into looking like different
 * products again. A label rather than a placeholder, because a placeholder
 * disappears the moment you start typing and takes the question with it.
 *
 * The hint sits outside the <label> and is tied on with aria-describedby. In
 * the label it became part of the field's name, so a screen reader announced
 * "Code from your email it can take a minute to arrive and it sometimes lands
 * in spam" as the name of the box.
 */
export default function Field({ id, label, icon: Icon, hint, reveal, revealed, onReveal, ...props }) {
  const t = useThemeTokens();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className={`block text-xs font-semibold mb-1.5 ${t.textSecondary}`}>{label}</label>
      <div className="relative">
        {Icon && <Icon className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${t.textMuted}`} />}
        <input
          id={id}
          aria-describedby={hintId}
          {...props}
          className={`w-full rounded-xl ${Icon ? "pl-10" : "pl-3"} ${reveal ? "pr-11" : "pr-3"} py-3 text-sm outline-none border focus:border-indigo-500 ${t.inputBg} ${t.divider}`}
        />
        {reveal && (
          <button
            type="button"
            onClick={onReveal}
            aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            className={`absolute right-1 top-1/2 -translate-y-1/2 p-2.5 rounded-lg ${t.textMuted}`}
          >
            {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {hint && <p id={hintId} className={`text-xs mt-1.5 ${t.textMuted}`}>{hint}</p>}
    </div>
  );
}
