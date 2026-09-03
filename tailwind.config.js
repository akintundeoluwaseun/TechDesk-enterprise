/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      // continuous, "liquid glass"-style corners — rounder than Tailwind's
      // defaults across every rounded-lg/xl/2xl/3xl surface in the app
      borderRadius: {
        lg: "1rem",
        xl: "1.25rem",
        "2xl": "1.75rem",
        "3xl": "2.25rem",
      },
    },
  },
  plugins: [],
};
