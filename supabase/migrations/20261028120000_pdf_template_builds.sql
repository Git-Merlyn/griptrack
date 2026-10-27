-- WP26 Phase 4 (TODO 9.21) — daily limit for "Set up this layout for me".
--
-- build-pdf-template asks Claude to suggest a supplier layout. Each request
-- costs money and sends page text to Anthropic, so it is limited to 5 per
-- organization per rolling 24 hours (Chris, WP26 Decision 3A). Only the
-- edge function (service role) records builds; clients have no access.
-- Rows hold no PDF text: who, which org, when.

create table public.pdf_template_builds (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index pdf_template_builds_org_time_idx on public.pdf_template_builds (org_id, created_at desc);

alter table public.pdf_template_builds enable row level security;
-- No policies: only the service role (which bypasses RLS) reads or writes.
revoke all on table public.pdf_template_builds from anon, authenticated;
grant all on table public.pdf_template_builds to service_role;

-- Records one build if the org is under the limit; returns whether it may
-- go ahead. The advisory lock serializes concurrent requests per org, so
-- two parallel builds cannot both take the last slot.
create or replace function public.record_pdf_template_build(p_org uuid, p_user uuid, p_limit integer default 5)
  returns boolean
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_used integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('pdf_template_builds:' || p_org::text, 0));
  select count(*) into v_used
    from public.pdf_template_builds b
   where b.org_id = p_org
     and b.created_at > now() - interval '24 hours';
  if v_used >= p_limit then
    return false;
  end if;
  insert into public.pdf_template_builds (org_id, user_id) values (p_org, p_user);
  return true;
end;
$$;

revoke execute on function public.record_pdf_template_build(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.record_pdf_template_build(uuid, uuid, integer) to service_role;
