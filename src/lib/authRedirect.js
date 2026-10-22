// src/lib/authRedirect.js
// Where to send a user after sign-in when they were bounced to /auth from a
// protected deep link (audit L27). Only app-relative paths are honoured;
// anything else (absolute URLs, protocol-relative "//host", auth pages that
// would loop) falls back to "/".
const NO_RETURN_PATHS = new Set(["/auth", "/invite", "/invite-accept", "/reset-password"]);

export function safeRedirectPath(from) {
  if (typeof from !== "string" || from.length === 0) return "/";
  // "/x" is fine; "//host" and "/\\host" are treated as protocol-relative
  // URLs by browsers.
  if (!from.startsWith("/") || from.startsWith("//") || from.startsWith("/\\")) return "/";
  for (const ch of from) {
    if (ch.charCodeAt(0) < 32) return "/";
  }
  const pathname = from.split(/[?#]/)[0];
  if (NO_RETURN_PATHS.has(pathname)) return "/";
  return from;
}
