/** @type {import('tailwindcss').Config} */

// Helper: returns a Tailwind color function that reads comma-separated RGB
// channels from a CSS custom property, with opacity modifier support.
// Uses the function form (not the "<alpha-value>" string form) so Vite's
// sucrase JSX transformer never chokes on angle-bracket syntax.
function cssVar(varName) {
  return ({ opacityValue }) =>
    opacityValue !== undefined
      ? `rgba(var(${varName}), ${opacityValue})`
      : `rgb(var(${varName}))`;
}

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: cssVar("--color-background"),
        surface:    cssVar("--color-surface"),
        accent:     cssVar("--color-accent"),
        text:       cssVar("--color-text"),
        warning:    cssVar("--color-warning"),
        danger:     cssVar("--color-danger"),
        success:    cssVar("--color-success"),
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
