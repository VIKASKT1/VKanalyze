ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS dataset_name TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS metadata JSONB;
CREATE INDEX IF NOT EXISTS activity_log_user_created_idx
  ON activity_log(user_id, created_at DESC);