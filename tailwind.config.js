/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Values are CSS variable RGB channels so opacity modifiers (bg-accent/20) work.
        // Themes are defined in index.css via :root (dark) and :root.light
        background: “rgb(var(--color-background) / <alpha-value>)”,
        surface:    “rgb(var(--color-surface)    / <alpha-value>)”,
        accent:     “rgb(var(--color-accent)     / <alpha-value>)”,
        text:       “rgb(var(--color-text)       / <alpha-value>)”,
        warning:    “rgb(var(--color-warning)    / <alpha-value>)”,
        danger:     “rgb(var(--color-danger)     / <alpha-value>)”,
        success:    “rgb(var(--color-success)    / <alpha-value>)”,
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"], // Optional: clean UI font
      },
    },
  },
  plugins: [],
};
