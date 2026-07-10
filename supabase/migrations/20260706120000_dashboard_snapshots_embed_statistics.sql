-- Root cause fix for "shared dashboard shows N/A values and Records = 0":
--
-- SharedDashboardView previously sourced KPI statistics (mean/min/max/quality
-- score) from a *separate* `analysis_sessions` row, looked up independently by
-- dataset_name. That row only exists if the owner explicitly persisted a
-- session to the cloud at some point — sharing a dashboard never guaranteed
-- one existed. A user who parses a file, builds a dashboard, and shares it
-- directly (without ever saving a session) produced a share link with a
-- perfectly good dashboard_snapshots row but no analysis_sessions match,
-- so every KPI reading `statistics`/`qualityScore` rendered "N/A".
--
-- Fix: statistics and qualityScore are already available as props in
-- DashboardTab at share time (no extra round-trip needed) — embed them
-- directly in the snapshot that's captured atomically with the rest of the
-- dashboard's rendering data, removing the cross-table dependency entirely.

ALTER TABLE dashboard_snapshots
  ADD COLUMN IF NOT EXISTS statistics jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_score integer NOT NULL DEFAULT 0;
