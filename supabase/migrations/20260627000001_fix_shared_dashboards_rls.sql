-- Fix RLS to allow anonymous viewers to read public, non-revoked, non-expired shared dashboards.
-- Anonymous users get access ONLY to the specific shared_dashboard record + its dashboard metadata.

-- Allow anon to read public shared_dashboards
DROP POLICY IF EXISTS "anon_read_public_shared_dashboards" ON shared_dashboards;
CREATE POLICY "anon_read_public_shared_dashboards"
  ON shared_dashboards FOR SELECT
  TO anon, authenticated
  USING (
    is_public = true
    AND revoked = false
    AND (expires_at IS NULL OR expires_at > now())
  );

-- Allow anon to read dashboards that have a valid share link
DROP POLICY IF EXISTS "anon_read_shared_dashboard_data" ON dashboards;
CREATE POLICY "anon_read_shared_dashboard_data"
  ON dashboards FOR SELECT
  TO anon
  USING (
    id IN (
      SELECT dashboard_id FROM shared_dashboards
      WHERE is_public = true
        AND revoked = false
        AND (expires_at IS NULL OR expires_at > now())
    )
  );

-- Allow anon to read analysis_sessions for datasets in shared dashboards
DROP POLICY IF EXISTS "anon_read_shared_analysis_sessions" ON analysis_sessions;
CREATE POLICY "anon_read_shared_analysis_sessions"
  ON analysis_sessions FOR SELECT
  TO anon
  USING (
    dataset_name IN (
      SELECT d.dataset_name FROM dashboards d
      INNER JOIN shared_dashboards sd ON sd.dashboard_id = d.id
      WHERE sd.is_public = true
        AND sd.revoked = false
        AND (sd.expires_at IS NULL OR sd.expires_at > now())
    )
  );

-- Add share_password_hash column if not already present (idempotent)
ALTER TABLE shared_dashboards
  ADD COLUMN IF NOT EXISTS share_password_hash text;
