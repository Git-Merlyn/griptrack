-- Fix: equipment deletion has been broken in production — the AFTER DELETE
-- audit trigger inserts a history row referencing the just-deleted item, and
-- fk_equipment_audit_equipment rejects it, failing the whole delete. The FK's
-- ON DELETE CASCADE was also wrong by design: it erased an item's entire
-- audit history at the moment of deletion. Audit rows should outlive the
-- rows they describe; drop the constraint (equipment_id stays as a plain
-- uuid, and readers already tolerate items that no longer exist).
alter table public.equipment_audit
  drop constraint if exists fk_equipment_audit_equipment;

-- In-app account deletion (App Store guideline 5.1.1(v), GDPR/PIPEDA).
--
-- Behavior:
--   - Sole owner (no other members): deletes the ENTIRE org — equipment,
--     audit, requests explicitly (no org-cascade FK on those), then the org
--     row (cascades members/teams/locations/invites/subscriptions), then the
--     auth user (cascades profile).
--   - Owner with other members: blocked — they must remove members or
--     transfer ownership first, so a team's data can't vanish by accident.
--   - Paid active subscription: blocked — cancel billing first so Stripe
--     doesn't keep charging a deleted account.
--   - Non-owner member: deletes just their auth user (membership + profile
--     cascade); the org and its data remain.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_role text;
  other_members int;
  sub_status text;
  sub_plan text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select om.org_id, om.role
    into v_org, v_role
  from public.organization_members om
  where om.user_id = v_uid
  limit 1;

  if v_org is not null and v_role = 'owner' then
    select count(*) into other_members
    from public.organization_members
    where org_id = v_org and user_id <> v_uid;

    if other_members > 0 then
      raise exception 'Your organization still has % other member(s). Remove them from Staff (or transfer ownership) before deleting your account.', other_members;
    end if;

    select s.status, s.plan into sub_status, sub_plan
    from public.subscriptions s
    where s.org_id = v_org;

    if sub_status in ('active', 'trialing') and coalesce(sub_plan, 'free') <> 'free' then
      raise exception 'You have an active paid subscription. Cancel it from Billing before deleting your account.';
    end if;

    -- Order matters: equipment_audit / equipment_items / beta_feedback all
    -- have NO ACTION FKs to organizations, and deleting equipment fires the
    -- audit trigger which writes NEW audit rows — so equipment goes first,
    -- then the audit sweep picks those up too.
    delete from public.equipment_items where org_id = v_org;
    delete from public.equipment_audit where org_id = v_org;
    delete from public.equipment_requests where org_id = v_org;
    -- Feedback has no personal identifiers; detach it from the org so the
    -- product signal survives anonymously.
    update public.beta_feedback set org_id = null where org_id = v_org;

    -- Cascades: organization_members, teams, locations, org_invites,
    -- subscriptions, productions.
    delete from public.organizations where id = v_org;
  end if;

  -- Cascades: profiles, any remaining organization_members row.
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
