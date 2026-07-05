-- Teams as an optional feature, OFF by default for new orgs.
--
-- The organizations.features default is already {"teams_enabled": false},
-- so new orgs get teams off. But the equipment model is team-scoped, so
-- "teams off" needs a working org-wide inventory path. This migration:
--   1. Freezes existing orgs' current effective teams_enabled as an explicit
--      value, so current testers are completely unaffected (new-orgs-only).
--   2. Adds org_teams_enabled() and teams-off equipment RLS so a flat,
--      org-wide inventory works when teams are disabled.

-- ── 1. Preserve existing orgs ────────────────────────────────────────────────
-- Today the client treats a missing teams_enabled key as true (?? true). Make
-- that explicit for every current org so flipping the client default to false
-- can't change their behavior. Orgs with an explicit value keep it.
update public.organizations
set features = jsonb_set(
      coalesce(features, '{}'::jsonb),
      '{teams_enabled}',
      to_jsonb(coalesce((features->>'teams_enabled')::boolean, true))
    )
where features->>'teams_enabled' is null;

-- ── 2. Helper: is teams mode on for this org? ────────────────────────────────
-- Defaults to false (off) to match the new product default.
create or replace function public.org_teams_enabled(_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((o.features->>'teams_enabled')::boolean, false)
  from public.organizations o
  where o.id = _org_id;
$$;

revoke all on function public.org_teams_enabled(uuid) from public;
grant execute on function public.org_teams_enabled(uuid) to authenticated;

-- ── 3. Teams-off equipment policies (supplement the team-scoped ones) ────────
-- These are permissive and OR with the existing "equipment ... by role"
-- policies, so teams-ON orgs are unaffected (org_teams_enabled = true makes
-- every branch here false).

-- Read: any active member sees the whole org pool.
create policy "equipment read (teams off)" on public.equipment_items
  for select
  using (
    not public.org_teams_enabled(org_id)
    and public.is_active_member(org_id)
  );

-- Insert: owner/admin/department_head (the buyer manages gear).
create policy "equipment insert (teams off)" on public.equipment_items
  for insert to authenticated
  with check (
    not public.org_teams_enabled(org_id)
    and org_id in (
      select om.org_id from public.organization_members om
      where om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'department_head')
    )
  );

-- Update: any active member — crew must be able to move gear (a location/qty
-- update). Delete stays owner/admin via the existing "equipment delete by role".
create policy "equipment update (teams off)" on public.equipment_items
  for update
  using (
    not public.org_teams_enabled(org_id)
    and public.is_active_member(org_id)
  )
  with check (
    not public.org_teams_enabled(org_id)
    and public.is_active_member(org_id)
  );
