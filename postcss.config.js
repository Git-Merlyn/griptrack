// Tailwind CSS v4 runs as a single PostCSS plugin. Vendor prefixing is built in
// (Lightning CSS), so autoprefixer is gone. Theme and sources live in
// src/index.css (@theme / @source); there is no tailwind.config.js any more.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
