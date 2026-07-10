-- Root cause fix for "Revoke -> Create Share Link -> still shows revoked":
--
-- The app has always assumed at most one shared_dashboards row per
-- (dashboard_id, user_id) — openShareModal looks it up with `.maybeSingle()`
-- and the whole Share Dialog is built around a single `sharing` record. But
-- nothing in the schema enforced that, and the app's create-link flow used to
-- always INSERT, never checking for (and reactivating) an existing revoked
-- row. That could produce duplicate rows for the same dashboard, which then
-- made the `.maybeSingle()` lookup itself ambiguous/fail.
--
-- The application code has been fixed to UPDATE (reactivate with a fresh
-- token) an existing row instead of inserting a second one. This migration
-- adds the constraint the app already assumed existed, as defense in depth —
-- first deduplicating any rows that predate the fix, keeping the most
-- recently created row for each (dashboard_id, user_id) pair.

DELETE FROM shared_dashboards a
USING shared_dashboards b
WHERE a.dashboard_id = b.dashboard_id
  AND a.user_id = b.user_id
  AND a.created_at < b.created_at;

-- If two rows for the same pair somehow share an identical created_at,
-- the above leaves both; break the tie deterministically by id.
DELETE FROM shared_dashboards a
USING shared_dashboards b
WHERE a.dashboard_id = b.dashboard_id
  AND a.user_id = b.user_id
  AND a.id < b.id;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shared_dashboards_dashboard_user_unique'
  ) THEN
    ALTER TABLE shared_dashboards
      ADD CONSTRAINT shared_dashboards_dashboard_user_unique UNIQUE (dashboard_id, user_id);
  END IF;
END $$;
