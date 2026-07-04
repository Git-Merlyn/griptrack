-- RLS hardening — closes holes found in the July 2026 policy audit.
--
-- Themes:
--   1. Two generations of equipment/audit policies were OR'd together; the
--      older, unscoped generation silently defeated the newer role/team-scoped
--      one (permissive policies combine with OR).
--   2. organization_members allowed privilege escalation: any authenticated
--      user could insert themselves into any org with any role, and admins
--      could grant 'owner' or delete the owner's membership.
--   3. org_invites was world-readable — pending invite tokens could be
--      enumerated and used to join orgs.
--   4. beta_feedback had RLS enabled but no policies at all → the in-app
--      feedback form was silently broken (deny-all).

-- ── 1. equipment_audit: drop the unscoped insert policy ──────────────────────
-- "WITH CHECK (true)" let any authenticated user write audit rows for any org.
-- The scoped "audit: members insert" policy (is_active_member) remains and
-- covers both direct client writes and the audit triggers (SECURITY INVOKER).
drop policy if exists "authenticated users can insert audit records" on public.equipment_audit;

-- ── 2. equipment_items: drop the old unscoped generation ─────────────────────
-- These OR'd with the "by role" policies and made them meaningless: any org
-- member could read/update all teams' equipment, and crew could insert.
-- The remaining "equipment ... by role" policies enforce:
--   read/update: owner/admin anywhere; dept_head/crew only their own team
--   insert:      owner/admin anywhere; dept_head only their own team
--   delete:      owner/admin only
drop policy if exists "equipment: members read"   on public.equipment_items;
drop policy if exists "equipment: members insert" on public.equipment_items;
drop policy if exists "equipment: members update" on public.equipment_items;
drop policy if exists "equipment: admins delete"  on public.equipment_items; -- duplicate of "equipment delete by role"

-- ── 3. organization_members: block escalation paths ──────────────────────────
-- 3a. Any authenticated user could insert themselves into ANY org with ANY
--     role (org takeover). All legitimate membership creation goes through
--     SECURITY DEFINER RPCs (ensure_org_for_user, accept_org_invite_for_user)
--     or the service-role invite-staff edge function — no client policy needed.
drop policy if exists "members_insert_self" on public.organization_members;

-- 3b. Admins could update any member row — including granting 'owner' to
--     themselves or rewriting the owner's row. Now: the owner's row is
--     untouchable, and 'owner' cannot be granted through the API.
drop policy if exists "members_update_admin" on public.organization_members;
create policy "members_update_admin" on public.organization_members
  for update to authenticated
  using (
    organization_members.role <> 'owner'
    and exists (
      select 1 from public.organization_members me
      where me.org_id = organization_members.org_id
        and me.user_id = auth.uid()
        and me.role in ('owner', 'admin')
    )
  )
  with check (
    organization_members.role <> 'owner'
    and exists (
      select 1 from public.organization_members me
      where me.org_id = organization_members.org_id
        and me.user_id = auth.uid()
        and me.role in ('owner', 'admin')
    )
  );

-- 3c. Admins could delete the owner's membership row.
drop policy if exists "org admins can remove members of their org" on public.organization_members;
create policy "org admins can remove members of their org" on public.organization_members
  for delete
  using (
    organization_members.role <> 'owner'
    and exists (
      select 1 from public.organization_members me
      where me.org_id = organization_members.org_id
        and me.user_id = auth.uid()
        and me.status = 'active'
        and me.role in ('owner', 'admin')
    )
  );

-- ── 4. org_invites: stop invite enumeration ──────────────────────────────────
-- "FOR SELECT USING (true)" exposed every pending invite (emails + tokens) to
-- any user. No client flow reads invites by token: acceptance happens via the
-- accept_org_invite_for_user SECURITY DEFINER RPC, and admin listing is
-- covered by "admins can manage invites".
drop policy if exists "anyone can read invite by token" on public.org_invites;

-- ── 5. equipment_requests: only admins review ─────────────────────────────────
-- Any org member could UPDATE any request — crew could approve their own.
-- Both apps only ever update via the admin review flow.
drop policy if exists "org members can update requests" on public.equipment_requests;
create policy "admins can review requests" on public.equipment_requests
  for update
  using (
    org_id in (
      select om.org_id from public.organization_members om
      where om.user_id = auth.uid() and om.role in ('owner', 'admin')
    )
  )
  with check (
    org_id in (
      select om.org_id from public.organization_members om
      where om.user_id = auth.uid() and om.role in ('owner', 'admin')
    )
  );

-- ── 6. beta_feedback: make the feedback form work ─────────────────────────────
-- RLS was enabled with zero policies (deny-all), so in-app feedback submissions
-- have been failing silently. Insert-only for signed-in users; nobody reads it
-- through the API.
create policy "authenticated can submit feedback" on public.beta_feedback
  for insert to authenticated
  with check (true);

-- ── 7. locations: let department heads add/edit (not delete) ─────────────────
-- The mobile app intentionally exposes location management to dept heads
-- (day-to-day usage), but the DB only allowed owner/admin — their writes were
-- silently failing. Delete remains owner/admin-only via "admins can manage".
create policy "dept heads can add locations" on public.locations
  for insert to authenticated
  with check (
    org_id in (
      select om.org_id from public.organization_members om
      where om.user_id = auth.uid() and om.role = 'department_head'
    )
  );
create policy "dept heads can edit locations" on public.locations
  for update to authenticated
  using (
    org_id in (
      select om.org_id from public.organization_members om
      where om.user_id = auth.uid() and om.role = 'department_head'
    )
  )
  with check (
    org_id in (
      select om.org_id from public.organization_members om
      where om.user_id = auth.uid() and om.role = 'department_head'
    )
  );

-- ── 8. organizations: owner-only updates, and protect billing columns ────────
-- org_update_admin let admins rewrite the org row. Updates are owner-gated in
-- both UIs; keep the owner policy only.
drop policy if exists "org_update_admin" on public.organizations;

-- Even the owner must not be able to edit trial_ends_at (self-serve trial
-- extension) or stripe fields. Column-level grants: authenticated users may
-- only update name and features; everything else is service-role only.
revoke update on public.organizations from authenticated;
grant update (name, features) on public.organizations to authenticated;

-- ── 9. reset_test_user: dev helper, not for API callers ──────────────────────
revoke execute on function public.reset_test_user(text) from public;
revoke execute on function public.reset_test_user(text) from anon;
revoke execute on function public.reset_test_user(text) from authenticated;

-- ── 10. audit trigger: stamp org_id (and user_id) on audit rows ───────────────
-- The trigger never wrote org_id, so every automatic audit row was org-less:
-- invisible to the org-scoped read policies and to the audit CSV export, and
-- only insertable at all because of the WITH CHECK (true) policy dropped in
-- step 1. Stamp org_id from the equipment row and user_id from the session.
create or replace function public.log_equipment_audit() returns trigger
    language plpgsql
    as $$
declare
  act text;
begin
  if (tg_op = 'INSERT') then
    act := 'create';

    insert into public.equipment_audit (
      org_id, user_id,
      equipment_id, action, actor,
      snapshot_after
    ) values (
      new.org_id, auth.uid(),
      new.id,
      act,
      new.updated_by,
      to_jsonb(new)
    );

    return new;
  end if;

  if (tg_op = 'UPDATE') then
    -- classify moves vs generic update
    if (new.location is distinct from old.location) then
      act := 'move';
    else
      act := 'update';
    end if;

    insert into public.equipment_audit (
      org_id, user_id,
      equipment_id, action, actor,
      from_location, to_location,
      delta_qty,
      snapshot_before, snapshot_after
    ) values (
      new.org_id, auth.uid(),
      new.id,
      act,
      new.updated_by,
      old.location,
      new.location,
      (coalesce(new.quantity,0) - coalesce(old.quantity,0)),
      to_jsonb(old),
      to_jsonb(new)
    );

    return new;
  end if;

  if (tg_op = 'DELETE') then
    act := 'delete';

    insert into public.equipment_audit (
      org_id, user_id,
      equipment_id, action, actor,
      from_location,
      snapshot_before
    ) values (
      old.org_id, auth.uid(),
      old.id,
      act,
      old.updated_by,
      old.location,
      to_jsonb(old)
    );

    return old;
  end if;

  return null;
end;
$$;

-- Backfill org_id on existing org-less audit rows where the equipment still
-- exists; rows whose snapshot carries the org are recovered from the JSON.
update public.equipment_audit a
set org_id = e.org_id
from public.equipment_items e
where a.org_id is null and e.id = a.equipment_id;

update public.equipment_audit a
set org_id = nullif(coalesce(a.snapshot_after->>'org_id', a.snapshot_before->>'org_id'), '')::uuid
where a.org_id is null
  and coalesce(a.snapshot_after->>'org_id', a.snapshot_before->>'org_id') is not null;
