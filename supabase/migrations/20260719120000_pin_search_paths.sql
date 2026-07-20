-- Security hygiene: pin search_path on the three SECURITY DEFINER functions
-- that were missing it (auth_org_id, create_free_subscription,
-- handle_new_user). Supabase's linter flags these as
-- function_search_path_mutable: a definer function that resolves table names
-- through the caller's search_path can be redirected to attacker-created
-- objects. Not directly reachable through PostgREST (clients can't set
-- search_path), so this is defense-in-depth, but every other definer function
-- in this schema already pins it — these three were just missed.

alter function public.auth_org_id() set search_path = public;
alter function public.create_free_subscription() set search_path = public;
alter function public.handle_new_user() set search_path = public;
