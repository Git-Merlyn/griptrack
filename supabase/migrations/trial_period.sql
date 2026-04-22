-- Migration: add trial_ends_at to organizations
-- Every new org gets a 14-day trial of Pro features starting from creation.

alter table organizations
  add column if not exists trial_ends_at timestamptz;

-- Back-fill existing orgs: trial started at row creation, ends 14 days later.
-- If created_at is not present (shouldn't happen in Supabase), fall back to now().
update organizations
  set trial_ends_at = coalesce(created_at, now()) + interval '14 days'
  where trial_ends_at is null;

-- New orgs automatically get a 14-day trial window.
alter table organizations
  alter column trial_ends_at set default now() + interval '14 days';
