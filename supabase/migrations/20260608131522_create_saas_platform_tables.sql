
-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_contacts' AND tablename='contacts') THEN
    CREATE POLICY "insert_contacts" ON contacts FOR INSERT TO public WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_own_contacts' AND tablename='contacts') THEN
    CREATE POLICY "select_own_contacts" ON contacts FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message TEXT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_feedback' AND tablename='feedback') THEN
    CREATE POLICY "insert_feedback" ON feedback FOR INSERT TO public WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_all_feedback' AND tablename='feedback') THEN
    CREATE POLICY "select_all_feedback" ON feedback FOR SELECT TO public USING (true);
  END IF;
END $$;

-- Support tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'support' CHECK (type IN ('bug', 'feature', 'support', 'other')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_support_tickets' AND tablename='support_tickets') THEN
    CREATE POLICY "insert_support_tickets" ON support_tickets FOR INSERT TO public WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_own_support_tickets' AND tablename='support_tickets') THEN
    CREATE POLICY "select_own_support_tickets" ON support_tickets FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Feature requests table
CREATE TABLE IF NOT EXISTS feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'planned', 'in_progress', 'completed', 'declined')),
  votes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE feature_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_all_feature_requests' AND tablename='feature_requests') THEN
    CREATE POLICY "select_all_feature_requests" ON feature_requests FOR SELECT TO public USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_feature_requests' AND tablename='feature_requests') THEN
    CREATE POLICY "insert_feature_requests" ON feature_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='update_feature_requests_votes' AND tablename='feature_requests') THEN
    CREATE POLICY "update_feature_requests_votes" ON feature_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Feature request votes (to prevent duplicate votes)
CREATE TABLE IF NOT EXISTS feature_request_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_request_id UUID REFERENCES feature_requests(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(feature_request_id, user_id)
);
ALTER TABLE feature_request_votes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_all_votes' AND tablename='feature_request_votes') THEN
    CREATE POLICY "select_all_votes" ON feature_request_votes FOR SELECT TO public USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_own_vote' AND tablename='feature_request_votes') THEN
    CREATE POLICY "insert_own_vote" ON feature_request_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='delete_own_vote' AND tablename='feature_request_votes') THEN
    CREATE POLICY "delete_own_vote" ON feature_request_votes FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Testimonials table
CREATE TABLE IF NOT EXISTS testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT,
  message TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_approved_testimonials' AND tablename='testimonials') THEN
    CREATE POLICY "select_approved_testimonials" ON testimonials FOR SELECT TO public USING (approved = true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='insert_testimonials' AND tablename='testimonials') THEN
    CREATE POLICY "insert_testimonials" ON testimonials FOR INSERT TO public WITH CHECK (true);
  END IF;
END $$;

-- Announcements table
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error')),
  active BOOLEAN NOT NULL DEFAULT true,
  link_text TEXT,
  link_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_active_announcements' AND tablename='announcements') THEN
    CREATE POLICY "select_active_announcements" ON announcements FOR SELECT TO public USING (active = true);
  END IF;
END $$;

-- User roles table (for admin RBAC)
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='select_own_role' AND tablename='user_roles') THEN
    CREATE POLICY "select_own_role" ON user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Insert admin role for Vikas
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'your email'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
