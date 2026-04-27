-- Add optional-feature flags to organizations.
--
-- New orgs default to features OFF (cleaner onboarding experience).
-- Existing orgs are updated to features ON so nothing breaks for current users.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS features JSONB NOT NULL
  DEFAULT '{"teams_enabled": false, "requests_enabled": false}'::jsonb;

-- Preserve backward compatibility: every org that existed before this
-- migration keeps both features enabled. Only brand-new orgs start with
-- them off.
UPDATE organizations
SET features = '{"teams_enabled": true, "requests_enabled": true}'::jsonb;
