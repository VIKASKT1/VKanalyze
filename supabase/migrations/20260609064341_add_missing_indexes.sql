CREATE INDEX IF NOT EXISTS sessions_user_created_idx
  ON analysis_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS versions_user_dataset_idx
  ON dataset_versions(user_id, dataset_name, version_number);
CREATE INDEX IF NOT EXISTS sql_queries_user_dataset_idx
  ON sql_queries(user_id, dataset_name, created_at DESC);