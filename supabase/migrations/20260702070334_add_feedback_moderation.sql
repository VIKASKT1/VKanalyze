-- Issue 4 (Admin Feedback Management): the admin dashboard's feedback tab
-- was read-only with no moderation actions (view only — no delete, resolve,
-- or archive), and could not search by user/email/title because those
-- columns didn't exist on the table at all.
--
-- There was also a second, latent bug: the 20260609064349_fix_feedback_rls
-- migration replaced the original "select_all_feedback" (USING (true))
-- policy with "select_own_feedback" (USING (auth.uid() = user_id)) to stop
-- every authenticated user from reading every other user's feedback — but
-- no admin-override policy was ever added afterward, unlike the equivalent
-- profiles fix in 20260630120000_add_admin_profile_rls_policies. That means
-- the Admin Dashboard's feedback query (using the normal authenticated
-- client) currently returns only the logged-in admin's own feedback rows,
-- not the full list — the same class of bug already fixed once for
-- profiles, using the same public.is_admin() helper this migration reuses.

-- ── New columns needed for moderation and search ──────────────────────────
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'
  CHECK (status IN ('open', 'resolved', 'archived'));
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback(status);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback(created_at DESC);

-- ── Admin RLS policies (reusing public.is_admin(), not a new check) ───────
DROP POLICY IF EXISTS "admin_select_all_feedback" ON feedback;
CREATE POLICY "admin_select_all_feedback" ON feedback FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_update_all_feedback" ON feedback;
CREATE POLICY "admin_update_all_feedback" ON feedback FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_all_feedback" ON feedback;
CREATE POLICY "admin_delete_all_feedback" ON feedback FOR DELETE
  TO authenticated USING (public.is_admin());

-- select_own_feedback (auth.uid() = user_id) and insert_feedback (public,
-- WITH CHECK (true)) from the earlier migrations are unchanged — regular
-- users still submit feedback and see only their own, exactly as before.
-- These new policies are additive (OR'd with the existing ones by Postgres
-- RLS), so only admins gain the extra read/update/delete reach.
