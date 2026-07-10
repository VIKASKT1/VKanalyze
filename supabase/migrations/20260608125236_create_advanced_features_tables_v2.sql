-- Analysis sessions
CREATE TABLE IF NOT EXISTS analysis_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  dataset_name text NOT NULL,
  file_size bigint,
  row_count integer,
  column_count integer,
  parsed_columns jsonb,
  statistics jsonb,
  quality_score numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE analysis_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_own_sessions' AND tablename='analysis_sessions') THEN
    CREATE POLICY "select_own_sessions" ON analysis_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_own_sessions' AND tablename='analysis_sessions') THEN
    CREATE POLICY "insert_own_sessions" ON analysis_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='update_own_sessions' AND tablename='analysis_sessions') THEN
    CREATE POLICY "update_own_sessions" ON analysis_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='delete_own_sessions' AND tablename='analysis_sessions') THEN
    CREATE POLICY "delete_own_sessions" ON analysis_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- SQL query history
CREATE TABLE IF NOT EXISTS sql_queries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dataset_name text NOT NULL,
  query text NOT NULL,
  is_saved boolean DEFAULT false,
  is_favorite boolean DEFAULT false,
  name text,
  execution_time_ms integer,
  row_count integer,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sql_queries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_own_queries' AND tablename='sql_queries') THEN
    CREATE POLICY "select_own_queries" ON sql_queries FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_own_queries' AND tablename='sql_queries') THEN
    CREATE POLICY "insert_own_queries" ON sql_queries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='update_own_queries' AND tablename='sql_queries') THEN
    CREATE POLICY "update_own_queries" ON sql_queries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='delete_own_queries' AND tablename='sql_queries') THEN
    CREATE POLICY "delete_own_queries" ON sql_queries FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Dataset version history
CREATE TABLE IF NOT EXISTS dataset_versions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dataset_name text NOT NULL,
  version_number integer NOT NULL,
  label text NOT NULL,
  columns jsonb,
  row_count integer,
  column_count integer,
  changes_summary text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE dataset_versions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_own_versions' AND tablename='dataset_versions') THEN
    CREATE POLICY "select_own_versions" ON dataset_versions FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_own_versions' AND tablename='dataset_versions') THEN
    CREATE POLICY "insert_own_versions" ON dataset_versions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='update_own_versions' AND tablename='dataset_versions') THEN
    CREATE POLICY "update_own_versions" ON dataset_versions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='delete_own_versions' AND tablename='dataset_versions') THEN
    CREATE POLICY "delete_own_versions" ON dataset_versions FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Dashboard definitions
CREATE TABLE IF NOT EXISTS dashboards (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  dataset_name text,
  widgets jsonb DEFAULT '[]'::jsonb,
  layout jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE dashboards ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_own_dashboards' AND tablename='dashboards') THEN
    CREATE POLICY "select_own_dashboards" ON dashboards FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_own_dashboards' AND tablename='dashboards') THEN
    CREATE POLICY "insert_own_dashboards" ON dashboards FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='update_own_dashboards' AND tablename='dashboards') THEN
    CREATE POLICY "update_own_dashboards" ON dashboards FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='delete_own_dashboards' AND tablename='dashboards') THEN
    CREATE POLICY "delete_own_dashboards" ON dashboards FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Gemini key usage tracking
CREATE TABLE IF NOT EXISTS gemini_key_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key_slot integer NOT NULL,
  request_type text,
  success boolean DEFAULT true,
  error_type text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE gemini_key_usage ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_gemini_usage' AND tablename='gemini_key_usage') THEN
    CREATE POLICY "select_gemini_usage" ON gemini_key_usage FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_gemini_usage' AND tablename='gemini_key_usage') THEN
    CREATE POLICY "insert_gemini_usage" ON gemini_key_usage FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
