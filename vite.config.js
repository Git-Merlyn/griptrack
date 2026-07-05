import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Source maps are generated and uploaded to Sentry only when an auth token is
// present (Vercel builds). Local/CI builds skip all of it — no token, no maps.
// Requires three env vars on Vercel: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT.
const uploadSourceMaps = !!process.env.SENTRY_AUTH_TOKEN;

export default defineConfig({
  plugins: [
    react(),
    uploadSourceMaps &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        sourcemaps: {
          // Maps are uploaded to Sentry, then removed from dist so they're
          // never publicly served.
          filesToDeleteAfterUpload: ["./dist/**/*.map"],
        },
      }),
  ],

  build: {
    // "hidden": emit .map files for the Sentry upload without adding
    // sourceMappingURL comments to the served bundles.
    sourcemap: uploadSourceMaps ? "hidden" : false,
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },

  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setupTests.js",
  },
});
