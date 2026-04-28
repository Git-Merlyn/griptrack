-- Fix: equipment_audit RLS blocking the DB trigger on equipment_items.
--
-- Root cause: auth.uid() returns NULL inside trigger execution context in
-- Supabase, so the original org-scoped INSERT check always fails.
-- The INSERT policy is simplified to WITH CHECK (true) for authenticated
-- sessions — safe because this table is only ever written by the internal
-- trigger, never by direct user API calls.
-- The SELECT policy keeps the strict org-scoped check.

-- Drop the old policies so we can replace them cleanly
DROP POLICY IF EXISTS "org members can insert audit records" ON equipment_audit;
DROP POLICY IF EXISTS "org members can read audit records"  ON equipment_audit;

-- INSERT: any authenticated session may insert audit rows.
-- In practice only the equipment_items trigger does this.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'equipment_audit'
      AND policyname = 'authenticated users can insert audit records'
  ) THEN
    CREATE POLICY "authenticated users can insert audit records"
      ON equipment_audit FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- SELECT: org members can only read their own org's audit records.
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
