/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // rgba() with comma-separated CSS variable channels — works with all PostCSS versions.
        // Opacity modifiers (bg-accent/20) work because Tailwind replaces <alpha-value>.
        // Themes switch by toggling :root.light in index.css.
        background: “rgba(var(--color-background), <alpha-value>)”,
        surface:    “rgba(var(--color-surface),    <alpha-value>)”,
        accent:     “rgba(var(--color-accent),     <alpha-value>)”,
        text:       “rgba(var(--color-text),       <alpha-value>)”,
        warning:    “rgba(var(--color-warning),    <alpha-value>)”,
        danger:     “rgba(var(--color-danger),     <alpha-value>)”,
        success:    “rgba(var(--color-success),    <alpha-value>)”,
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"], // Optional: clean UI font
      },
    },
  },
  plugins: [],
};
