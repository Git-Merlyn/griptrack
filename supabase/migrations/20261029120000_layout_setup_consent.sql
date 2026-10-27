-- WP26 Phase 4 (TODO 9.21) — "Set up this layout for me" asks once per account.
--
-- Before the first suggestion, the user is told that the text of the first
-- two pages goes to Anthropic, an outside service, and agrees (Chris,
-- 2026-10-27: once per account, not every time). The agreement is stored on
-- the profile, and build-pdf-template refuses to send anything for an
-- account that hasn't agreed, so the record and the behaviour match.

alter table public.profiles
  add column if not exists layout_setup_consent_at timestamptz;

comment on column public.profiles.layout_setup_consent_at is
  'When the user agreed that "Set up this layout for me" sends the first two pages'' text of a PDF to Anthropic (WP26). Null = not yet asked.';

-- Records the agreement with the server's clock; keeps the first date.
create or replace function public.record_layout_setup_consent()
  returns timestamptz
  language plpgsql
  security definer
  set search_path to 'public'
as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  update public.profiles p
     set layout_setup_consent_at = coalesce(p.layout_setup_consent_at, now())
   where p.id = auth.uid()
  returning p.layout_setup_consent_at into v_at;
  return v_at;
end;
$$;

revoke all on function public.record_layout_setup_consent() from public, anon;
grant execute on function public.record_layout_setup_consent() to authenticated, service_role;
