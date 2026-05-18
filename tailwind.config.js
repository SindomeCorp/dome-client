/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    "./views/**/*.ejs",
    "./src/client/**/*.{js,jsx}",
    "./src/client/react/**/*.{js,jsx}", // ensure React IDE files are scanned
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Use CSS variables so light/dark can flip via the `.dark` class.
        // The variables must be defined in your /src/client/react/ide.css.
        bg: {
          canvas: "rgb(var(--bg-canvas) / <alpha-value>)",
          surface: "rgb(var(--bg-surface) / <alpha-value>)",
          sunken: "rgb(var(--bg-sunken) / <alpha-value>)",
          raised: "rgb(var(--bg-raised, var(--bg-surface)) / <alpha-value>)", // optional extra token
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          invert: "rgb(var(--ink-invert) / <alpha-value>)",
        },
        line: {
          subtle: "rgb(var(--line-subtle) / <alpha-value>)",
          strong: "rgb(var(--line-strong) / <alpha-value>)",
        },
        brand: {
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
        },
        // Keep your semantic tokens for status/dirty states
        warn: { 500: "#f59e0b" }, // amber-500
        ok:   { 500: "#10b981" }, // emerald-500
      },
      boxShadow: {
        // keep your card shadow; you can upgrade later if you like
        card: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
