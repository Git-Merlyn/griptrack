-- WP08 / audit M21: delete_my_account must refuse while ANY non-terminal
-- Stripe subscription is recorded for the org — not only active/trialing.
--
-- Before: the guard was `status in ('active','trialing') and plan <> 'free'`.
-- A past_due / unpaid / incomplete / paused subscription passed it, the org
-- delete cascaded the subscriptions row away (losing the Stripe ids), and
-- Stripe kept retrying invoices against a customer nothing maps to anymore.
--
-- After: refuse whenever stripe_subscription_id is set and the status is not
-- terminal ('canceled', 'incomplete_expired'). The plan column is no longer
-- consulted: a row with no Stripe subscription cannot be billed whatever its
-- plan says, and a row with one can be billed whatever its plan says.
--
-- The delete-account edge function cancels billing in Stripe and syncs this
-- row to status 'canceled' before calling the RPC, so in-app deletion is not
-- blocked by this guard; it only stops a direct RPC call (or a failed sync)
-- from orphaning a live Stripe subscription.
--
-- Everything else is unchanged from the previous definition. The
-- remaining-members guard text is mirrored in
-- supabase/functions/delete-account/index.ts (audit M22) — keep both in sync.

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
  sub_stripe_id text;
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
    -- Mirrored in supabase/functions/delete-account/index.ts (pre-Stripe
    -- guard). Keep the count and the message identical in both places.
    select count(*) into other_members
    from public.organization_members
    where org_id = v_org and user_id <> v_uid;

    if other_members > 0 then
      raise exception 'Your organization still has % other member(s). Remove them from Staff (or transfer ownership) before deleting your account.', other_members;
    end if;

    select s.status, s.stripe_subscription_id
      into sub_status, sub_stripe_id
    from public.subscriptions s
    where s.org_id = v_org;

    if sub_stripe_id is not null
       and coalesce(sub_status, '') not in ('canceled', 'incomplete_expired') then
      raise exception 'You have a paid subscription that is still active or awaiting payment. Cancel it from Billing before deleting your account.';
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

-- CREATE OR REPLACE keeps the existing ACL; restated so this file alone
-- documents the intended surface (matches 20260720130000_definer_grants_policy_lints.sql).
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated, service_role;
