-- WP04 (audit L66) — new functions are no longer executable by PUBLIC/anon.
--
-- 20260720130000_definer_grants_policy_lints.sql revoked anon/PUBLIC EXECUTE
-- from every existing function, but the default privileges still granted
-- EXECUTE on every FUTURE function created by postgres to PUBLIC (Postgres
-- built-in) and to anon (Supabase's per-schema default), so the next
-- `create function` would silently regress.
--
-- After this, a new function in public is executable by postgres,
-- authenticated and service_role only. A future anonymous RPC must
-- `grant execute ... to anon` explicitly. Trigger functions and internal
-- helpers should still `revoke execute ... from authenticated` explicitly.

-- Built-in PUBLIC grant: global default (no IN SCHEMA — a per-schema entry
-- cannot remove a global default).
alter default privileges for role postgres revoke execute on functions from public;
-- Supabase's per-schema grant to anon.
alter default privileges for role postgres in schema public revoke execute on functions from anon;
