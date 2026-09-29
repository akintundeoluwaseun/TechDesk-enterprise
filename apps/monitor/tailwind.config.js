export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Dark, like the TechDesk app's own welcome: a near-black ground,
        // cards a step lighter with a hairline edge, and colour carried by
        // soft light rather than by fills.
        ground: "#0a0c10",
        card: "#12151c",
        sunk: "#1a1e27",
        ink: { DEFAULT: "#f2f4f8", soft: "#a8b0bf", faint: "#6b7385" },
      },
      boxShadow: {
        raised: "0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 48px -28px rgba(0,0,0,0.9)",
        "raised-sm": "0 1px 0 rgba(255,255,255,0.05) inset, 0 10px 24px -16px rgba(0,0,0,0.9)",
        pressed: "inset 0 2px 6px rgba(0,0,0,0.5)",
        glow: "0 0 0 1px rgba(56,189,248,0.35), 0 12px 40px -12px rgba(56,189,248,0.45)",
      },
      borderRadius: { xl2: "22px" },
    },
  },
  plugins: [],
};
