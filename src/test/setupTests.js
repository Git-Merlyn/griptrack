import "@testing-library/jest-dom";

// Node >= 25 defines its own globalThis.localStorage (undefined unless
// --localstorage-file is set), which shadows jsdom's. vitest.config.js passes
// --no-experimental-webstorage to the workers (WP00). If that flag is ever
// lost, fail once with a clear message instead of 27 confusing test errors.
if (typeof window !== "undefined" && typeof globalThis.localStorage?.getItem !== "function") {
  throw new Error(
    "jsdom localStorage is missing. Keep execArgv ['--no-experimental-webstorage'] in vitest.config.js, or run the tests on Node 22/24.",
  );
}
