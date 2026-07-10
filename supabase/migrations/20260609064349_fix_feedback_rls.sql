DROP POLICY IF EXISTS "select_all_feedback" ON feedback;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE policyname='select_own_feedback' AND tablename='feedback') THEN
    CREATE POLICY "select_own_feedback" ON feedback
      FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;