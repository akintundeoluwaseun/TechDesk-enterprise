export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Taken from the design. A soft blue-grey ground with white cards
        // raised off it -- the whole look depends on the ground never being
        // pure white, or the cards have nothing to sit on.
        ground: "#eaeef5",
        card: "#ffffff",
        sunk: "#e4e9f2",
        ink: { DEFAULT: "#1e2430", soft: "#5b6478", faint: "#94a0b5" },
      },
      boxShadow: {
        raised: "6px 6px 14px rgba(163,177,198,0.32), -6px -6px 14px rgba(255,255,255,0.9)",
        "raised-sm": "3px 3px 8px rgba(163,177,198,0.28), -3px -3px 8px rgba(255,255,255,0.85)",
        pressed: "inset 3px 3px 7px rgba(163,177,198,0.4), inset -3px -3px 7px rgba(255,255,255,0.85)",
      },
      borderRadius: { xl2: "22px" },
    },
  },
  plugins: [],
};
