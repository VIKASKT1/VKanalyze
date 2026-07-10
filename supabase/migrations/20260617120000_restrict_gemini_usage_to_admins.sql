-- Phase 11 security hardening.
--
-- gemini_key_usage is an internal operational metrics table (which Gemini
-- API key slot was used, success/failure, request type, timestamp). It has
-- no user_id and contains no personal data, but it was readable by *any*
-- authenticated user, which is broader than necessary — only admins/ops
-- need this for capacity planning and incident response. Tighten it.

DROP POLICY IF EXISTS "select_gemini_usage" ON gemini_key_usage;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE policyname = 'select_gemini_usage_admin_only' AND tablename = 'gemini_key_usage') THEN
    CREATE POLICY "select_gemini_usage_admin_only" ON gemini_key_usage
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- insert_gemini_usage (INSERT ... USING (true)) is left as-is: it's written
-- exclusively by the gemini-proxy edge function using the service role, and
-- INSERT policies with WITH CHECK (true) don't expose existing rows to
-- callers — they only permit writes, not reads.
