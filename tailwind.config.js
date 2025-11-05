/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0f1117", // Deep navy background
        surface: "#1a1d23", // Slightly lighter panel
        accent: "#4debf9", // Neon blue
        warning: "#ffd600", // Yellow for “Out”
        danger: "#ff4d4d", // Red for “Damaged”
        success: "#2ecc71", // Green for “Available”
        text: "#9ca3af", // Light grey for text
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"], // Optional: clean UI font
      },
    },
  },
  plugins: [],
};
