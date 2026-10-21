# Archived migrations

These pre-date proper migration tracking — they were applied to the hosted
database by hand and don't follow the CLI's `<timestamp>_name.sql` naming, so
`supabase` commands skipped them with warnings.

Their effects (and the rest of the hand-built schema) are fully captured in
`../migrations/20260704152501_remote_schema.sql`, pulled from the live
database with `supabase db pull`. They're kept here for historical reference
only — do not apply them.

All future schema changes should be created with `supabase migration new <name>`
so they run in order everywhere.

## Known inaccuracies in these files

- `audit_rls.sql`: its stated root cause ("auth.uid() returns NULL inside
  trigger execution context") is wrong, and the `WITH CHECK (true)` INSERT
  policy it creates was a forgery hole, removed by
  `../migrations/20260704204438_rls_hardening.sql`. Never re-run it.
- `teams.sql`: its header says the `productions` table "was never applied to
  production DB". It was: `productions` (table, member/admin and ghost
  policies, and the `equipment_items.production_id` FK) is live in
  `../migrations/20260704152501_remote_schema.sql`. No app code uses it.
- `teams.sql` remapped the legacy `'staff'` role to `'crew'`, but
  `accept_org_invite_for_user` kept a `coalesce(v_role, 'staff')` fallback
  (`../migrations/20260711120000_team_on_invite.sql`) until
  `../migrations/20261021030000_invites_membership_hardening.sql` replaced it
  (audit L62).
