-- Two hardening items from the July 2026 whole-system audit.

-- ── 1. beta_feedback: stamp org_id server-side ───────────────────────────────
-- The insert policy is WITH CHECK (true), so clients could attribute feedback
-- to any org (or none). Instead of trusting the client, a BEFORE INSERT
-- trigger overwrites org_id with the caller's actual membership. Runs as
-- invoker; reading one's own organization_members row is allowed by the
-- members_select_self policy. Service-role inserts (auth.uid() null) keep
-- whatever org_id they supplied.

create or replace function public.set_feedback_org()
  returns trigger
  language plpgsql
  set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is not null then
    select om.org_id into v_org
    from public.organization_members om
    where om.user_id = auth.uid();
    new.org_id := v_org;  -- authoritative, even if null (user has no org yet)
  end if;
  return new;
end;
$$;

drop trigger if exists beta_feedback_set_org on public.beta_feedback;
create trigger beta_feedback_set_org
  before insert on public.beta_feedback
  for each row execute function public.set_feedback_org();

-- ── 2. invite_sends: log of invite emails for rate limiting ──────────────────
-- invite-staff (edge fn, service role) records every send and checks the
-- per-org hourly count before sending. Re-invites to the same address bump
-- the count too — the thing being limited is outbound email, not distinct
-- invitees. Service-role only: RLS enabled with no policies.

create table if not exists public.invite_sends (
  id      bigint generated always as identity primary key,
  org_id  uuid not null,
  user_id uuid not null,
  email   text not null,
  at      timestamptz not null default now()
);

create index if not exists invite_sends_org_at_idx on public.invite_sends (org_id, at);

alter table public.invite_sends enable row level security;
