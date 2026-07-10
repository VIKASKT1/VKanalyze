
-- Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_own_workspaces' AND tablename='workspaces') THEN
    CREATE POLICY "select_own_workspaces" ON workspaces FOR SELECT TO authenticated USING (auth.uid() = owner_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_own_workspaces' AND tablename='workspaces') THEN
    CREATE POLICY "insert_own_workspaces" ON workspaces FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='update_own_workspaces' AND tablename='workspaces') THEN
    CREATE POLICY "update_own_workspaces" ON workspaces FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='delete_own_workspaces' AND tablename='workspaces') THEN
    CREATE POLICY "delete_own_workspaces" ON workspaces FOR DELETE TO authenticated USING (auth.uid() = owner_id);
  END IF;
END $$;

-- Shared dashboards (no raw data)
CREATE TABLE IF NOT EXISTS shared_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID REFERENCES dashboards(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_public BOOLEAN NOT NULL DEFAULT false,
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE shared_dashboards ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_own_shared' AND tablename='shared_dashboards') THEN
    CREATE POLICY "select_own_shared" ON shared_dashboards FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_public_shared' AND tablename='shared_dashboards') THEN
    CREATE POLICY "select_public_shared" ON shared_dashboards FOR SELECT TO public USING (is_public = true AND revoked = false);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_shared_dashboards' AND tablename='shared_dashboards') THEN
    CREATE POLICY "insert_shared_dashboards" ON shared_dashboards FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='update_own_shared' AND tablename='shared_dashboards') THEN
    CREATE POLICY "update_own_shared" ON shared_dashboards FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='delete_own_shared' AND tablename='shared_dashboards') THEN
    CREATE POLICY "delete_own_shared" ON shared_dashboards FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error', 'announcement')),
  read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_own_notifications' AND tablename='notifications') THEN
    CREATE POLICY "select_own_notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_notifications' AND tablename='notifications') THEN
    CREATE POLICY "insert_notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='update_own_notifications' AND tablename='notifications') THEN
    CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='delete_own_notifications' AND tablename='notifications') THEN
    CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- User preferences / platform settings
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  ai_privacy_mode TEXT NOT NULL DEFAULT 'strict' CHECK (ai_privacy_mode IN ('strict', 'enhanced')),
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  export_format TEXT NOT NULL DEFAULT 'csv' CHECK (export_format IN ('csv', 'xlsx', 'json')),
  high_contrast BOOLEAN NOT NULL DEFAULT false,
  compact_mode BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_own_prefs' AND tablename='user_preferences') THEN
    CREATE POLICY "select_own_prefs" ON user_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_own_prefs' AND tablename='user_preferences') THEN
    CREATE POLICY "insert_own_prefs" ON user_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='update_own_prefs' AND tablename='user_preferences') THEN
    CREATE POLICY "update_own_prefs" ON user_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Login / session history (security)
CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'sign_in' CHECK (event_type IN ('sign_in', 'sign_out', 'password_change', 'failed_attempt')),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_own_login_history' AND tablename='login_history') THEN
    CREATE POLICY "select_own_login_history" ON login_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_login_history' AND tablename='login_history') THEN
    CREATE POLICY "insert_login_history" ON login_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
