import { supabase } from "@/lib/supabaseClient";

/**
 * Sign out. If the server cannot be reached, supabase-js keeps the stored
 * session (even with scope "local", which still calls /logout), so the next
 * page load would still be signed in. In that case remove the stored session
 * from localStorage ourselves (audit L31).
 *
 * Never throws. Returns { localOnly: true } when the server sign-out failed.
 */
export async function signOutWithLocalFallback() {
  let error;
  try {
    ({ error } = await supabase.auth.signOut());
  } catch (e) {
    error = e;
  }
  if (!error) return { localOnly: false };

  // Protected in the auth-js typings; supabase-js always sets it
  // (sb-<project-ref>-auth-token).
  const key = supabase.auth.storageKey;
  if (typeof key === "string" && key) {
    for (const k of [key, `${key}-user`, `${key}-code-verifier`]) {
      try {
        window.localStorage.removeItem(k);
      } catch {
        // storage blocked: nothing more we can do
      }
    }
  }
  return { localOnly: true };
}
