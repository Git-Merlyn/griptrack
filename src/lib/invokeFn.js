// src/lib/invokeFn.js
import { supabase } from "@/lib/supabaseClient";

function pickMessage(body) {
  if (!body || typeof body !== "object") return "";
  for (const key of ["error", "message", "msg"]) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * Call a Supabase Edge Function and return its parsed body.
 *
 * supabase.functions.invoke() resolves a non-2xx response as
 * { data: null, error: FunctionsHttpError } — the function's own
 * `{ "error": "..." }` body ("Admins only", "Invite limit reached", "Only the
 * org owner can manage billing") is only reachable through the Response. This
 * helper reads it and throws an Error carrying that message, plus `status`
 * (HTTP status, when known) and `cause` (the original supabase-js error).
 */
export async function invokeFn(name, options) {
  const { data, error, response } = await supabase.functions.invoke(name, options);

  if (!error) {
    // Defensive: a 2xx body that still reports an error.
    if (data && typeof data === "object" && !Array.isArray(data) && typeof data.error === "string" && data.error) {
      throw Object.assign(new Error(data.error), { status: response?.status });
    }
    return data;
  }

  // supabase-js >= 2.90 returns `response`; older versions only set error.context.
  const res = response ?? error.context;
  let message = "";
  if (res && typeof res.json === "function") {
    try {
      message = pickMessage(await res.json());
    } catch {
      // Body was not JSON (gateway HTML, empty body) — fall back below.
    }
  }

  throw Object.assign(new Error(message || error.message || `Request to ${name} failed`), {
    status: typeof res?.status === "number" ? res.status : undefined,
    cause: error,
  });
}
