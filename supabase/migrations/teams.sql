-- Teams migration (fresh — productions table was never applied to production DB)
-- Departments (Grip, Electric, Camera, etc.) within an org.
-- Each equipment item optionally belongs to a team. Users are assigned to a team.

-- ─── 1. Create teams table ────────────────────────────────────────────────────
create table if not exists teams (
  id         uuid        primary key default gen_random_uuid(),
  org_id     uuid        not null references organizations(id) on delete cascade,
  name       text        not null,
  status     text        not null default 'active' check (status in ('active', 'archived')),
  max_seats  integer     not null default 10,
  created_at timestamptz not null default now()
);

create index if not exists teams_org_id_idx on teams (org_id);

-- Enable RLS
alter table teams enable row level security;

-- ─── 2. Add team_id to equipment_items ───────────────────────────────────────
alter table equipment_items
  add column if not exists team_id uuid references teams(id) on delete set null;

create index if not exists equipment_items_team_id_idx on equipment_items (team_id);

-- ─── 3. Add team_id to organization_members ──────────────────────────────────
-- Which team does this user belong to? Null = no team assigned (admin/owner).
alter table organization_members
  add column if not exists team_id uuid references teams(id) on delete set null;

create index if not exists org_members_team_id_idx on organization_members (team_id);

-- ─── 4. Add department_head to allowed roles ─────────────────────────────────
-- Drop the old constraint first — it doesn't include 'crew', so the remap below
-- would be blocked if the constraint were still in place.
alter table organization_members
  drop constraint if exists organization_members_role_check;

-- Remap legacy 'staff' → 'crew'. Department heads are assigned manually later.
update organization_members set role = 'crew' where role = 'staff';

-- Recreate constraint with the full role set.
alter table organization_members
  add constraint organization_members_role_check
  check (role in ('owner', 'admin', 'department_head', 'crew'));

-- ─── 5. RLS policies on teams ────────────────────────────────────────────────
drop policy if exists "org members can read teams" on teams;
drop policy if exists "admins can manage teams" on teams;

-- All org members can read teams
create policy "org members can read teams"
  on teams for select
  using (
    org_id in (
      select org_id from organization_members where user_id = auth.uid()
    )
  );

-- Only admins and owners can create/update/delete teams
create policy "admins can manage teams"
  on teams for all
  using (
    org_id in (
      select org_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- ─── 6. RLS policies on equipment_items ──────────────────────────────────────
drop policy if exists "org members can read equipment" on equipment_items;
drop policy if exists "admins can manage equipment" on equipment_items;
drop policy if exists "crew can read equipment" on equipment_items;
drop policy if exists "equipment read by role" on equipment_items;
drop policy if exists "equipment insert by role" on equipment_items;
drop policy if exists "equipment update by role" on equipment_items;
drop policy if exists "equipment delete by role" on equipment_items;

-- Read: crew/dept_head see only their team; admin/owner see all
create policy "equipment read by role"
  on equipment_items for select
  using (
    org_id in (
      select om.org_id from organization_members om
      where om.user_id = auth.uid()
      and (
        om.role in ('owner', 'admin')
        or
        (om.role in ('crew', 'department_head') and om.team_id = equipment_items.team_id)
      )
    )
  );

-- Insert: department_head can only insert into their own team; admin/owner unrestricted
create policy "equipment insert by role"
  on equipment_items for insert
  with check (
    org_id in (
      select om.org_id from organization_members om
      where om.user_id = auth.uid()
      and (
        om.role in ('owner', 'admin')
        or
        (om.role = 'department_head' and om.team_id = equipment_items.team_id)
      )
    )
  );

-- Update: crew can update (for moves); dept_head/admin/owner can update anything in their scope
create policy "equipment update by role"
  on equipment_items for update
  using (
    org_id in (
      select om.org_id from organization_members om
      where om.user_id = auth.uid()
      and (
        om.role in ('owner', 'admin')
        or
        (om.role in ('department_head', 'crew') and om.team_id = equipment_items.team_id)
      )
    )
  );

-- Delete: admin and owner only
create policy "equipment delete by role"
  on equipment_items for delete
  using (
    org_id in (
      select om.org_id from organization_members om
      where om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
    )
  );

-- ─── 7. Ensure audit log captures user_id ────────────────────────────────────
alter table equipment_audit
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists equipment_audit_user_id_idx on equipment_audit (user_id);

-- ─── 8. Enable realtime for equipment_requests (if not already) ──────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename = 'equipment_requests'
  ) then
    alter publication supabase_realtime add table equipment_requests;
  end if;
end $$;
