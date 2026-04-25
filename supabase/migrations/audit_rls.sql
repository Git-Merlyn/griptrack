-- Fix: equipment_audit RLS was blocking the DB trigger that fires on
-- equipment_items INSERT/UPDATE/DELETE. Add permissive policies so org
-- members can write and read their own audit records.

-- INSERT: allow org members to write audit records
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'equipment_audit'
      AND policyname = 'org members can insert audit records'
  ) THEN
    CREATE POLICY "org members can insert audit records"
      ON equipment_audit FOR INSERT
      WITH CHECK (
        org_id IN (
          SELECT org_id FROM organization_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- SELECT: allow org members to read their audit records
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'equipment_audit'
      AND policyname = 'org members can read audit records'
  ) THEN
    CREATE POLICY "org members can read audit records"
      ON equipment_audit FOR SELECT
      USING (
        org_id IN (
          SELECT org_id FROM organization_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
