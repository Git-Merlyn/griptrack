// supabase/functions/_shared/deps.ts
//
// The one place the edge functions pin @supabase/supabase-js (audit L77).
// Every function imports createClient from here, so a bump is a one-line
// change. Exact version on purpose: a bare "@2" re-resolves on every deploy.
// npm:stripe is pinned exactly in each Stripe function's own import line.
export { createClient } from "npm:@supabase/supabase-js@2.117.3";
export type { SupabaseClient, User } from "npm:@supabase/supabase-js@2.117.3";
