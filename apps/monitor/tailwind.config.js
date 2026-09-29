// Colours come from CSS variables (index.css), so one class serves both
// themes: `bg-card` is neutral-100 in light and neutral-800 in dark, the
// same greys the TechDesk app itself uses.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ground: v("ground"),
        card: v("card"),
        sunk: v("sunk"),
        side: v("side"),
        line: v("line"),
        ink: { DEFAULT: v("ink"), soft: v("ink-soft"), faint: v("ink-faint") },
      },
      boxShadow: {
        raised: "0 1px 2px rgb(0 0 0 / 0.06)",
        "raised-sm": "0 1px 2px rgb(0 0 0 / 0.05)",
        pressed: "inset 0 1px 2px rgb(0 0 0 / 0.08)",
      },
      borderRadius: { xl2: "18px" },
    },
  },
  plugins: [],
};
