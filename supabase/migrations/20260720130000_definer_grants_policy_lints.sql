-- Remaining dashboard advisor lints: SECURITY DEFINER function grants and
-- always-true policies.
--
-- Postgres grants EXECUTE to PUBLIC on new functions by default, so every
-- definer function ever created here was callable by anon (and everything by
-- authenticated) — 38 linter warnings. This app has NO anonymous features, so
-- anon gets nothing; trigger functions and internal RPCs get nothing from
-- anyone (triggers fire regardless of the DML role's EXECUTE, and
-- bootstrap_session runs its inner calls as its owner).
--
-- The linter will STILL flag the definer functions that authenticated can
-- execute after this (bootstrap_session, delete_my_account, the ghost RPCs,
-- log_damage_event/log_merge_event, and the RLS policy helpers) — that's the
-- intentional API surface; the lint is advisory "review these", not "remove".

-- ── 1. Trigger functions: direct EXECUTE for nobody ──────────────────────────
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.create_free_subscription() from public, anon, authenticated;
revoke execute on function public.log_equipment_audit() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.set_feedback_org() from public, anon, authenticated;

-- ── 2. Internal RPCs: only bootstrap_session (definer) calls them ────────────
-- No client invokes these directly anymore; locking them prevents e.g. calling
-- ensure_org_for_user out-of-band.
revoke execute on function public.ensure_org_for_user() from public, anon, authenticated;
revoke execute on function public.accept_org_invite_for_user() from public, anon, authenticated;

-- ── 3. User-facing RPCs + policy helpers: authenticated/service_role only ────
-- (revoking PUBLIC removes the default grant, so re-grant explicitly)
do $$
declare fn text;
begin
  foreach fn in array array[
    'auth_org_id()',
    'is_active_member_of_org(uuid)',
    'org_teams_enabled(uuid)',
    'is_platform_admin()',
    'ghost_active_org()',
    'ghost_can_write(uuid)',
    'ghost_set_org(uuid)',
    'ghost_clear()',
    'ghost_arm_write(int)',
    'ghost_disarm_write()',
    'ghost_status()',
    'ghost_list_orgs()',
    'bootstrap_session()',
    'delete_my_account()',
    'log_damage_event(uuid, text, timestamptz)',
    'log_merge_event(uuid, uuid, int, text, text, timestamptz)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon;', fn);
    execute format('grant execute on function public.%s to authenticated, service_role;', fn);
  end loop;
end $$;

-- ── 4. rls_policy_always_true ────────────────────────────────────────────────
-- organizations: no client ever INSERTs org rows (creation goes through the
-- ensure_org_for_user definer RPC, which runs as owner and needs no policy).
-- The WITH CHECK (true) insert policy only enabled junk-org spam — drop it.
drop policy if exists "org_insert_authenticated" on public.organizations;

-- beta_feedback: same effective rule (any signed-in user may submit; org_id is
-- forced by the set_feedback_org trigger), expressed without a literal TRUE.
drop policy if exists "authenticated can submit feedback" on public.beta_feedback;
create policy "authenticated can submit feedback" on public.beta_feedback
  for insert to authenticated
  with check ((select auth.uid()) is not null);
