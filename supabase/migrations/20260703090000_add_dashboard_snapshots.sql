-- Dashboard snapshots: privacy-preserving, aggregated data needed to render a
-- shared dashboard's charts/tables without persisting the full raw dataset.
--
-- Design:
-- - Raw dataset rows stay local (IndexedDB) by default — this table NEVER
--   stores a full dataset. It stores only what individual widgets need:
--     * category widgets (bar/pie): a capped top-N value→count frequency map
--     * trend widgets (line/area):  a capped, downsampled array of numeric points
--     * table widgets:              a small preview (only if the user explicitly
--                                    opts in via `preview_included`)
-- - One snapshot row per shared dashboard (1:1 with shared_dashboards.id),
--   recomputed whenever the owner (re)shares or updates the dashboard.
-- - RLS mirrors shared_dashboards: owner can read/write their own; anonymous
--   viewers can read only the snapshot tied to a currently valid public share.

CREATE TABLE IF NOT EXISTS dashboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_dashboard_id uuid NOT NULL REFERENCES shared_dashboards(id) ON DELETE CASCADE,
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  row_count integer NOT NULL DEFAULT 0,
  -- { [widgetId]: { column, buckets: [{name, count}] } }
  category_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- { [widgetId]: { column, points: [{i, value}] } }
  series_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Only populated when the owner explicitly opts in to including a preview.
  preview_included boolean NOT NULL DEFAULT false,
  preview_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  preview_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (shared_dashboard_id)
);

ALTER TABLE dashboard_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='owner_all_dashboard_snapshots' AND tablename='dashboard_snapshots') THEN
    CREATE POLICY "owner_all_dashboard_snapshots" ON dashboard_snapshots
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='anon_read_shared_dashboard_snapshots' AND tablename='dashboard_snapshots') THEN
    CREATE POLICY "anon_read_shared_dashboard_snapshots" ON dashboard_snapshots
      FOR SELECT TO anon
      USING (
        shared_dashboard_id IN (
          SELECT id FROM shared_dashboards
          WHERE is_public = true
            AND revoked = false
            AND (expires_at IS NULL OR expires_at > now())
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dashboard_snapshots_shared
  ON dashboard_snapshots(shared_dashboard_id);
