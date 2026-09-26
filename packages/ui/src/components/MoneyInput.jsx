import React, { useLayoutEffect, useRef } from "react";

function digitsOnly(s) {
  // A shop's own habit is to write money with thousands commas -- "150,000"
  // -- and a plain <input type="number"> refuses that keystroke outright:
  // the browser drops the comma silently, with no error and no visible sign
  // anything happened, at the exact point in typing where the habit says
  // one belongs. This field exists to accept it rather than reject it, so
  // anything that is not a digit or a decimal point is simply dropped here.
  return (s || "").replace(/[^\d.]/g, "");
}

function withCommas(digits) {
  if (!digits) return "";
  const [whole, frac] = digits.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac !== undefined ? `${grouped}.${frac}` : grouped;
}

/** How many digits (or decimal points) sit before `index` in `str`. */
function digitsBefore(str, index) {
  return str.slice(0, index).replace(/[^\d.]/g, "").length;
}

/** The character offset in `str` that sits just after the Nth digit/point. */
function offsetAfterDigits(str, n) {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < str.length; i++) {
    if (/[\d.]/.test(str[i])) {
      seen += 1;
      if (seen === n) return i + 1;
    }
  }
  return str.length;
}

/**
 * A money amount, typed the way a shop actually writes one.
 *
 * Re-inserting the commas live, on every keystroke, is the easy half of this
 * -- the naive version of it throws the cursor to the end of the field on
 * every render, which makes editing anywhere but the last digit impossible.
 * This counts how many digits sat before the cursor BEFORE the keystroke,
 * reformats, and puts the cursor back after that same digit -- not the same
 * character offset, which shifts every time a comma is added or removed.
 *
 * `value`/`onChange` carry the clean number as a plain string with no commas
 * -- `Number(value)` always works -- so callers use it exactly like a plain
 * input; only what is drawn on screen has commas in it.
 */
export default function MoneyInput({ value, onChange, className, placeholder, ...rest }) {
  const ref = useRef(null);
  const pendingCaretDigits = useRef(null);

  const display = withCommas(digitsOnly(String(value ?? "")));

  // Runs after the DOM has the new, reformatted text but before the browser
  // paints it -- setting the caret any earlier would place it against the
  // text still on screen from before this keystroke.
  useLayoutEffect(() => {
    if (pendingCaretDigits.current == null || !ref.current) return;
    const pos = offsetAfterDigits(display, pendingCaretDigits.current);
    ref.current.setSelectionRange(pos, pos);
    pendingCaretDigits.current = null;
  }, [display]);

  function handleChange(e) {
    const raw = e.target.value;
    const caret = e.target.selectionStart ?? raw.length;
    pendingCaretDigits.current = digitsBefore(raw, caret);
    onChange(digitsOnly(raw));
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      {...rest}
    />
  );
}
