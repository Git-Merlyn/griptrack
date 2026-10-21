-- WP04 (audit L65, L71) — org integrity constraints.
--
-- Kept in its own (last) migration: if production holds a NULL org_id or an
-- orphaned request, this file fails as a unit and nothing else in WP04 is
-- affected. Run the pre-checks in fix-plan/WP04-rls-audit-integrity.md first.
--
-- L71: equipment_items.org_id / equipment_audit.org_id were nullable; a
--      NULL-org row is invisible to every client. FKs stay NO ACTION on
--      purpose (CASCADE on items would fire the audit trigger and insert audit
--      rows for the org being deleted, failing the delete anyway; the explicit
--      sweep order in delete_my_account is the supported path).
-- L65: equipment_requests.org_id had no FK at all. CASCADE is safe here (no
--      triggers on requests delete); delete_my_account's explicit delete of
--      requests stays and is now redundant but harmless.

alter table public.equipment_items alter column org_id set not null;
alter table public.equipment_audit alter column org_id set not null;

alter table public.equipment_requests
  add constraint equipment_requests_org_id_fkey
  foreign key (org_id) references public.organizations(id) on delete cascade
  not valid;
alter table public.equipment_requests
  validate constraint equipment_requests_org_id_fkey;
-- (equipment_requests_org_created already indexes org_id for the FK.)
