-- Add dataset_name column to existing chat_messages table
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS dataset_name TEXT NOT NULL DEFAULT '';

-- Drop the foreign key constraint on dataset_id since we'll use dataset_name instead
-- (dataset_id column is kept for backward compat but unused)

-- Update RLS: drop old per-verb policies and replace with a single all-operations policy
DROP POLICY IF EXISTS "select_own_messages" ON chat_messages;
DROP POLICY IF EXISTS "insert_own_messages" ON chat_messages;
DROP POLICY IF EXISTS "update_own_messages" ON chat_messages;
DROP POLICY IF EXISTS "delete_own_messages" ON chat_messages;

CREATE POLICY "users_manage_own_chat_messages"
  ON chat_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast per-user per-dataset queries
CREATE INDEX IF NOT EXISTS chat_messages_user_dataset_idx
  ON chat_messages(user_id, dataset_name, created_at);
