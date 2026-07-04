/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Matches the web app exactly
        background: '#0f1117', // deep navy
        surface: '#1a1d23',    // slightly lighter panel
        accent: '#4debf9',     // neon cyan
        warning: '#ffd600',    // yellow — "Out"
        danger: '#ff4d4d',     // red — "Damaged"
        success: '#2ecc71',    // green — "Available"
        text: '#9ca3af',       // light grey
      },
    },
  },
  plugins: [],
};
