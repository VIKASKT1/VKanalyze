-- Add missing columns to shared_dashboards that the app expects
ALTER TABLE shared_dashboards
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS share_password TEXT,
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

-- Add missing columns to profiles for user management
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;
