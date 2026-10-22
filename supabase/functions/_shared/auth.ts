// supabase/functions/_shared/auth.ts
import { createClient, type SupabaseClient, type User } from "./deps.ts";
import { json } from "./http.ts";

export type AuthedCaller = {
  user: User;
  /** User-scoped client: RLS applies and auth.uid() is the caller. */
  supabase: SupabaseClient;
};

/**
 * Require a real signed-in user. Gateway verify_jwt alone also accepts the
 * public anon key, which ships in every client bundle, so each function
 * must check the user itself.
 *
 * Returns the caller, or a Response (401/500) to return as-is:
 *   const auth = await requireUser(req);
 *   if (auth instanceof Response) return auth;
 *   const { user, supabase } = auth;
 */
export async function requireUser(req: Request): Promise<AuthedCaller | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    console.error("requireUser: SUPABASE_URL or SUPABASE_ANON_KEY is not set");
    return json({ error: "Server misconfigured" }, 500);
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return json({ error: "Unauthorized" }, 401);

  return { user: data.user, supabase };
}
