-- Teams — replaces Productions
-- Departments (Grip, Electric, Camera, etc.) within an org.
-- Each equipment item belongs to a team. Users are assigned to a team.

-- ─── 1. Rename productions → teams ───────────────────────────────────────────
alter table productions rename to teams;

-- Rename columns to match new domain language
alter table teams rename column production_id to id; -- id was already 'id', skip
-- (productions.id is already named id — no rename needed)

-- Add max_seats so department heads know their invite limit
alter table teams add column if not exists max_seats integer not null default 10;

-- Drop the start_date/end_date columns (not relevant for teams)
-- Keep them for now in case data exists; can drop in a later migration.

-- ─── 2. Rename production_id → team_id on equipment_items ────────────────────
alter table equipment_items rename column production_id to team_id;

-- Drop old index and recreate with new name
drop index if exists equipment_items_production_id_idx;
create index if not exists equipment_items_team_id_idx on equipment_items (team_id);

-- ─── 3. Add team_id to organization_members ──────────────────────────────────
-- Which team does this user belong to? Null = no team assigned (admin/owner).
alter table organization_members
  add column if not exists team_id uuid references teams(id) on delete set null;

create index if not exists org_members_team_id_idx on organization_members (team_id);

-- ─── 4. Add department_head to allowed roles ─────────────────────────────────
-- Drop the existing check constraint and recreate with the new role.
-- (constraint name may vary — find it first if this errors and adjust the name)
alter table organization_members
  drop constraint if exists organization_members_role_check;

alter table organization_members
  add constraint organization_members_role_check
  check (role in ('owner', 'admin', 'department_head', 'crew'));

-- ─── 5. Update RLS policies on teams ────────────────────────────────────────
drop policy if exists "org members can read productions" on teams;
drop policy if exists "admins can manage productions" on teams;

-- All org members can read teams (crew needs to know team names for the switcher)
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

-- ─── 6. Update RLS on equipment_items ────────────────────────────────────────
-- crew and department_head: only see their own team's items
-- admin and owner: see all items in the org

-- Drop existing equipment_items policies (recreate below)
drop policy if exists "org members can read equipment" on equipment_items;
drop policy if exists "admins can manage equipment" on equipment_items;
drop policy if exists "crew can read equipment" on equipment_items;

-- Read: crew/dept_head see only their team; admin/owner see all
create policy "equipment read by role"
  on equipment_items for select
  using (
    org_id in (
      select om.org_id from organization_members om
      where om.user_id = auth.uid()
      and (
        -- admin/owner see everything in their org
        om.role in ('owner', 'admin')
        or
        -- crew/dept_head see only their team
        (om.role in ('crew', 'department_head') and om.team_id = equipment_items.team_id)
      )
    )
  );

-- Insert: department_head and above can add items
create policy "equipment insert by role"
  on equipment_items for insert
  with check (
    org_id in (
      select om.org_id from organization_members om
      where om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'department_head')
    )
  );

-- Update: crew can update (for moves); dept_head/admin/owner can update anything
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

-- ─── 8. Enable realtime for equipment_requests ───────────────────────────────
-- Allows mobile clients to get live updates on request status changes.
alter publication supabase_realtime add table equipment_requests;
