import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setupTests.js",
    globals: true,
    // The mobile app under mobile/ has its own jest suite — keep vitest out
    exclude: ["**/node_modules/**", "mobile/**"],
    // Node >= 25 ships a built-in globalThis.localStorage (undefined without
    // --localstorage-file) that shadows jsdom's. Turn it off in test workers.
    // Flag exists on Node >= 22.4; harmless no-op on 22/24.
    execArgv: ["--no-experimental-webstorage"],
  },
});
