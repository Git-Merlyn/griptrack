// supabase/functions/_shared/http.ts
//
// CORS headers, the JSON response helper and the public app URL, shared by
// the edge functions. No imports and no Deno globals at module scope, so the
// web vitest suite can import it (see http.test.ts).

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** JSON body + CORS headers. Same signature as the old per-file helpers. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export const DEFAULT_APP_URL = "https://griptrack.app";

type EnvGet = (key: string) => string | undefined;

const denoEnv: EnvGet = (key) =>
  (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(key);

/**
 * Public web origin for links in emails and Stripe redirects (audit L74).
 * Reads the APP_URL secret, falls back to production, strips trailing "/".
 * Every value used here must be in Supabase Auth → URL Configuration →
 * Redirect URLs, or GoTrue silently swaps invite links to the Site URL.
 */
export function getAppUrl(getEnv: EnvGet = denoEnv): string {
  const raw = (getEnv("APP_URL") ?? "").trim();
  return (raw || DEFAULT_APP_URL).replace(/\/+$/, "");
}
