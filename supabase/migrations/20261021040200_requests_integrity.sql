-- WP04 (audit L65, L72) — equipment_requests integrity.
--
-- L65: the INSERT policy only checked org_id, so a member could file a request
--      as a colleague (requested_by), pre-approve it (status/reviewed_*), or
--      put any name in requester_name. Now requested_by must be the caller,
--      new requests must be pending/unreviewed, and requester_name is stamped
--      from the caller's profile. Both clients already send exactly this.
-- L72: requests_enabled was enforced only in navigation. The INSERT policy now
--      requires the org's requests feature to be on. SELECT and the admin
--      review UPDATE stay open so history remains visible/reviewable.
-- The org_id FK is added in 20261021040600_org_fk_not_null.sql.

-- ── 1. org_requests_enabled(): mirror of org_teams_enabled() ───────────────
create or replace function public.org_requests_enabled(_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((o.features->>'requests_enabled')::boolean, false)
  from public.organizations o
  where o.id = _org_id;
$$;

revoke execute on function public.org_requests_enabled(uuid) from public, anon;
grant execute on function public.org_requests_enabled(uuid) to authenticated, service_role;

-- ── 2. Stamp requester_name server-side ────────────────────────────────────
-- Invoker (like set_feedback_org): the caller can read their own profile.
-- Service-role inserts (auth.uid() null) keep what they supplied.
create or replace function public.set_request_requester()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_name text;
begin
  if auth.uid() is not null then
    select coalesce(nullif(trim(p.full_name), ''), p.email)
      into v_name
      from public.profiles p
     where p.id = auth.uid();
    if v_name is not null then
      new.requester_name := v_name;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.set_request_requester() from public, anon, authenticated;

drop trigger if exists equipment_requests_set_requester on public.equipment_requests;
create trigger equipment_requests_set_requester
  before insert on public.equipment_requests
  for each row execute function public.set_request_requester();

-- ── 3. Tighten the member INSERT policy ────────────────────────────────────
drop policy if exists "org members can insert requests" on public.equipment_requests;
create policy "org members can insert requests" on public.equipment_requests
  for insert to authenticated
  with check (
    org_id = (select public.auth_org_id())
    and requested_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and public.org_requests_enabled(org_id)
  );
-- platform_admin_write_ins (armed ghost) on equipment_requests is unchanged.
