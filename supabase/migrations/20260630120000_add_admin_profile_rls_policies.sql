-- Fixes Issue 2 (Admin Users page empty): the original RLS policy on
-- profiles ("select_own_profile") only ever allowed auth.uid() = id, with
-- no exception for admins. That meant any client-side query against
-- profiles — including the Admin Dashboard's user list and the suspend/
-- activate actions — silently returned/affected at most the caller's own
-- single row, no matter who the caller was.
--
-- The actual user list is now served by the admin-list-users Edge Function
-- using the Service Role key (which bypasses RLS entirely and is the only
-- way to safely read auth.users at all). This migration adds an explicit
-- admin-bypass SELECT/UPDATE policy on profiles as defense-in-depth, so:
--   1) Any other part of the app that legitimately needs an admin to read
--      another user's profile row works correctly through normal RLS
--      rather than silently returning nothing.
--   2) Admin suspend/activate actions, which the client performs directly
--      against `profiles`, actually take effect instead of being a no-op.
--
-- A helper function is used (rather than inlining a subquery in the policy)
-- to avoid recursive RLS evaluation issues when the policy itself queries
-- the table it's defined on.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Allow admins to read any profile (in addition to the existing
-- "select_own_profile" policy, which still covers normal users reading
-- their own row).
DROP POLICY IF EXISTS "admin_select_all_profiles" ON profiles;
CREATE POLICY "admin_select_all_profiles" ON profiles FOR SELECT
  TO authenticated USING (public.is_admin());

-- Allow admins to update any profile (needed for suspend/activate/role
-- changes performed from the Admin Dashboard).
DROP POLICY IF EXISTS "admin_update_all_profiles" ON profiles;
CREATE POLICY "admin_update_all_profiles" ON profiles FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
