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
        heading:    cssVar("--color-heading"),
        warning:    cssVar("--color-warning"),
        danger:     cssVar("--color-danger"),
        success:    cssVar("--color-success"),
        // Themed gray ramp (audit M11). The pages were written for the dark
        // theme using Tailwind's gray-* for body text, borders and chips, so
        // in light mode they rendered light-on-white. The dark values in
        // src/index.css are Tailwind's default grays exactly (dark mode looks
        // the same); the light values invert the ramp, so "bright text on
        // dark" becomes "dark text on light". Consequence: in light mode
        // gray-900 is LIGHT. For new UI prefer the semantic tokens
        // (text-heading, text-text, bg-surface, bg-background).
        gray: {
          50:  cssVar("--gray-50"),
          100: cssVar("--gray-100"),
          200: cssVar("--gray-200"),
          300: cssVar("--gray-300"),
          400: cssVar("--gray-400"),
          500: cssVar("--gray-500"),
          600: cssVar("--gray-600"),
          700: cssVar("--gray-700"),
          800: cssVar("--gray-800"),
          900: cssVar("--gray-900"),
          950: cssVar("--gray-950"),
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
