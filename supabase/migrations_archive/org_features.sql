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

-- RLS: allow org owners to update their own organization row.
-- Without this policy the features toggle silently fails because the
-- default organizations RLS only allows SELECT for members.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'organizations'
      AND policyname = 'owners can update their organization'
  ) THEN
    CREATE POLICY "owners can update their organization"
      ON organizations FOR UPDATE
      USING (
        id IN (
          SELECT org_id FROM organization_members
          WHERE user_id = auth.uid()
            AND role = 'owner'
        )
      )
      WITH CHECK (
        id IN (
          SELECT org_id FROM organization_members
          WHERE user_id = auth.uid()
            AND role = 'owner'
        )
      );
  END IF;
END $$;
