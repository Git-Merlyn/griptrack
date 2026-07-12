-- Platform-admin "ghost" role: let a developer view (and, when explicitly
-- armed, edit) any org WITHOUT being a member of it.
--
-- Design goals:
--   * Invisible to orgs — a ghost never appears in organization_members, so it
--     is never counted as a member, seat, or shown in member lists.
--   * Read-only by default — a ghost can SELECT the org it is pointed at, but
--     cannot mutate anything unless write is explicitly armed.
--   * Write is time-boxed — arming write sets an expiry; it auto-disables so
--     god-mode can't be left on by accident. Switching org disarms write.
--   * Additive RLS — we only ADD permissive policies; existing member policies
--     are untouched, so normal behavior can't regress and this reverts cleanly
--     by dropping the platform_admin_* policies.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Who is a ghost. Deliberately separate from organization_members.
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);

-- A ghost's current target org + whether write is armed. One row per admin.
create table if not exists public.platform_admin_state (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  active_org_id    uuid references public.organizations(id) on delete set null,
  write_enabled    boolean not null default false,
  write_expires_at timestamptz,
  updated_at       timestamptz not null default now()
);

-- Audit trail of ghost actions (org switches, write arm/disarm).
create table if not exists public.platform_admin_audit (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  org_id     uuid,
  action     text not null,
  detail     text,
  at         timestamptz not null default now()
);

-- Lock these down: RLS on, and NO permissive policies, so PostgREST/clients
-- cannot read or write them directly. All access goes through the SECURITY
-- DEFINER helpers/RPCs below.
alter table public.platform_admins       enable row level security;
alter table public.platform_admin_state  enable row level security;
alter table public.platform_admin_audit  enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Helper functions (used inside RLS — SECURITY DEFINER, STABLE)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_platform_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  );
$$;

-- The org the current ghost is pointed at (null if not an admin / none selected).
create or replace function public.ghost_active_org()
  returns uuid
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select s.active_org_id
  from public.platform_admin_state s
  where s.user_id = auth.uid()
    and public.is_platform_admin();
$$;

-- Whether the ghost may WRITE to the given org right now: must be an admin,
-- write armed, unexpired, and targeting exactly that org.
create or replace function public.ghost_can_write(target_org uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select exists (
    select 1
    from public.platform_admin_state s
    where s.user_id = auth.uid()
      and public.is_platform_admin()
      and s.write_enabled
      and s.active_org_id = target_org
      and s.write_expires_at is not null
      and s.write_expires_at > now()
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Gated RPCs (client entry points — every one checks is_platform_admin)
-- ─────────────────────────────────────────────────────────────────────────────

-- Point the ghost at an org. Always resets write to OFF (safety on switch).
create or replace function public.ghost_set_org(p_org uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_org) then
    raise exception 'org not found' using errcode = 'P0002';
  end if;

  insert into public.platform_admin_state (user_id, active_org_id, write_enabled, write_expires_at, updated_at)
  values (auth.uid(), p_org, false, null, now())
  on conflict (user_id) do update
    set active_org_id = excluded.active_org_id,
        write_enabled = false,
        write_expires_at = null,
        updated_at = now();

  insert into public.platform_admin_audit (user_id, org_id, action)
  values (auth.uid(), p_org, 'set_org');
end;
$$;

-- Stop ghosting entirely (back to just your own org).
create or replace function public.ghost_clear()
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;
  update public.platform_admin_state
     set active_org_id = null, write_enabled = false, write_expires_at = null, updated_at = now()
   where user_id = auth.uid();

  insert into public.platform_admin_audit (user_id, org_id, action)
  values (auth.uid(), null, 'clear');
end;
$$;

-- Arm write for deep debugging, time-boxed (default 30 min, capped at 120).
create or replace function public.ghost_arm_write(p_minutes int default 30)
  returns timestamptz
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_org uuid;
  v_expires timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;

  select active_org_id into v_org from public.platform_admin_state where user_id = auth.uid();
  if v_org is null then
    raise exception 'select an org before arming write' using errcode = 'P0001';
  end if;

  v_expires := now() + make_interval(mins => least(greatest(p_minutes, 1), 120));

  update public.platform_admin_state
     set write_enabled = true, write_expires_at = v_expires, updated_at = now()
   where user_id = auth.uid();

  insert into public.platform_admin_audit (user_id, org_id, action, detail)
  values (auth.uid(), v_org, 'arm_write', 'expires ' || v_expires::text);

  return v_expires;
end;
$$;

create or replace function public.ghost_disarm_write()
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare v_org uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not a platform admin' using errcode = '42501';
  end if;
  select active_org_id into v_org from public.platform_admin_state where user_id = auth.uid();

  update public.platform_admin_state
     set write_enabled = false, write_expires_at = null, updated_at = now()
   where user_id = auth.uid();

  insert into public.platform_admin_audit (user_id, org_id, action)
  values (auth.uid(), v_org, 'disarm_write');
end;
$$;

-- Status for the UI: whether you're an admin, your target org, write state.
create or replace function public.ghost_status()
  returns table (
    is_admin bool,
    active_org_id uuid,
    write_enabled bool,
    write_expires_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select
    public.is_platform_admin(),
    s.active_org_id,
    coalesce(s.write_enabled, false) and coalesce(s.write_expires_at > now(), false),
    s.write_expires_at
  from (select auth.uid() as uid) me
  left join public.platform_admin_state s on s.user_id = me.uid;
$$;

grant execute on function public.ghost_set_org(uuid)     to authenticated;
grant execute on function public.ghost_clear()           to authenticated;
grant execute on function public.ghost_arm_write(int)    to authenticated;
grant execute on function public.ghost_disarm_write()    to authenticated;
grant execute on function public.ghost_status()          to authenticated;
grant execute on function public.is_platform_admin()     to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Additive RLS policies
--    READ: any org-scoped table, gated to the ghost's active org.
--    WRITE: core mutable tables, gated to armed+unexpired write on that org.
-- ─────────────────────────────────────────────────────────────────────────────

-- READ on org_id-scoped tables (uniform: org_id = ghost_active_org()).
do $$
declare t text;
begin
  foreach t in array array[
    'equipment_items','equipment_audit','equipment_requests','locations',
    'teams','org_invites','subscriptions','productions','organization_members'
  ] loop
    execute format(
      'create policy "platform_admin_read" on public.%I for select ' ||
      'using (public.is_platform_admin() and org_id = public.ghost_active_org());', t);
  end loop;
end $$;

-- READ on the org itself (keyed by id, not org_id).
create policy "platform_admin_read" on public.organizations
  for select using (public.is_platform_admin() and id = public.ghost_active_org());

-- READ on profiles of the active org's members.
create policy "platform_admin_read" on public.profiles
  for select using (
    public.is_platform_admin()
    and id in (
      select m.user_id from public.organization_members m
      where m.org_id = public.ghost_active_org()
    )
  );

-- WRITE on core mutable org tables (insert/update/delete), gated by armed write.
do $$
declare t text;
begin
  foreach t in array array[
    'equipment_items','equipment_requests','locations','teams',
    'org_invites','productions','organization_members'
  ] loop
    execute format(
      'create policy "platform_admin_write_ins" on public.%I for insert ' ||
      'with check (public.ghost_can_write(org_id));', t);
    execute format(
      'create policy "platform_admin_write_upd" on public.%I for update ' ||
      'using (public.ghost_can_write(org_id)) with check (public.ghost_can_write(org_id));', t);
    execute format(
      'create policy "platform_admin_write_del" on public.%I for delete ' ||
      'using (public.ghost_can_write(org_id));', t);
  end loop;
end $$;

-- WRITE on the org row itself (update only; keyed by id).
create policy "platform_admin_write_upd" on public.organizations
  for update using (public.ghost_can_write(id)) with check (public.ghost_can_write(id));

-- Equipment mutations fire an audit-log trigger. Let armed ghost writes insert
-- the resulting audit rows for the active org (append-only: insert only).
create policy "platform_admin_write_ins" on public.equipment_audit
  for insert with check (public.ghost_can_write(org_id));
