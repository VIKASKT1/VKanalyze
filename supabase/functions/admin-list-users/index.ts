// admin-list-users
//
// Fixes the empty Admin → Users page. The client previously queried the
// `profiles` table directly, but that table's RLS policy
// ("select_own_profile") only allows `auth.uid() = id` — every caller,
// admin or not, can only ever see their own single row through the
// client SDK. There was never an admin-bypass policy, so the page wasn't
// "broken" so much as correctly enforcing RLS down to nothing useful.
//
// auth.users itself can never be queried from the client at all (no RLS
// applies to it; Supabase blocks client access entirely). The only way to
// read it is via the Service Role key, which must never reach the browser.
// This function does that server-side: verifies the caller's JWT, confirms
// they hold the 'admin' role (looked up with the Service Role client, so it
// is not subject to the same RLS restriction), and only then reads
// auth.users via the Admin API and joins it with profiles/dashboards/
// login_history/activity_log — all with the Service Role key, which never
// leaves this function.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

interface AdminListUsersBody {
  search?: string;
  page?: number;      // 0-indexed
  page_size?: number;  // default 20, max 100
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    // Step 1: verify the caller's JWT using the anon client (RLS still
    // applies here — this just confirms who they are, nothing privileged).
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser();
    if (authError || !caller) return json({ error: 'Unauthorized' }, 401);

    // Step 2: Service Role client — bypasses RLS entirely. Used ONLY
    // server-side, never exposed to the browser.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Step 3: confirm the caller is actually an admin. Using adminClient
    // here (not anonClient) is intentional: it means this check works
    // regardless of the profiles RLS policy shape, and can't be bypassed by
    // a non-admin who simply lacks a row in `profiles`.
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();
    if (callerProfile?.role !== 'admin') return json({ error: 'Forbidden' }, 403);

    const body = (await req.json().catch(() => ({}))) as AdminListUsersBody;
    const search = (body.search ?? '').trim().toLowerCase();
    const page = Math.max(0, body.page ?? 0);
    const pageSize = Math.min(100, Math.max(1, body.page_size ?? 20));

    // auth.users can only be read via the Admin API (admin.listUsers), never
    // via .from('auth.users') — Supabase does not expose that table through
    // PostgREST at all, by design. We page through it here. Supabase's
    // admin.listUsers itself supports pagination but not search, so for
    // search queries we walk all pages once (capped) and filter in memory;
    // for the common unfiltered case we only fetch the page actually needed
    // when possible, but auth.users page boundaries don't line up with
    // we fetch a generously-sized window and paginate after the join.
    const allAuthUsers: Array<{
      id: string;
      email?: string;
      created_at: string;
      email_confirmed_at?: string | null;
      last_sign_in_at?: string | null;
      user_metadata?: Record<string, unknown>;
    }> = [];
    let authPage = 1;
    const AUTH_PAGE_SIZE = 1000;
    // Cap total scanned users to keep this function fast and bounded.
    const MAX_SCAN = 5000;
    while (allAuthUsers.length < MAX_SCAN) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page: authPage, perPage: AUTH_PAGE_SIZE });
      if (error) return json({ error: `Failed to list users: ${error.message}` }, 500);
      const batch = data?.users ?? [];
      allAuthUsers.push(...batch.map(u => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        email_confirmed_at: u.email_confirmed_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        user_metadata: u.user_metadata ?? {},
      })));
      if (batch.length < AUTH_PAGE_SIZE) break;
      authPage += 1;
    }

    const userIds = allAuthUsers.map(u => u.id);
    if (userIds.length === 0) {
      return json({ users: [], total: 0, page, page_size: pageSize });
    }

    // Join supporting data — all via the Service Role client.
    const [profilesRes, dashboardsRes, loginsRes, activityRes] = await Promise.all([
      adminClient.from('profiles').select('id, role, suspended, full_name, created_at').in('id', userIds),
      adminClient.from('dashboards').select('user_id').in('user_id', userIds),
      adminClient
        .from('login_history')
        .select('user_id, event_type, created_at')
        .eq('event_type', 'sign_in')
        .in('user_id', userIds)
        .order('created_at', { ascending: false }),
      adminClient
        .from('activity_log')
        .select('user_id, created_at')
        .in('user_id', userIds)
        .order('created_at', { ascending: false }),
    ]);

    const profileById = new Map((profilesRes.data ?? []).map(p => [p.id as string, p]));

    const dashboardCountById = new Map<string, number>();
    for (const d of dashboardsRes.data ?? []) {
      const uid = d.user_id as string;
      dashboardCountById.set(uid, (dashboardCountById.get(uid) ?? 0) + 1);
    }

    // Most-recent sign-in per user (login_history is already ordered desc,
    // so the first occurrence per user_id is the most recent).
    const lastLoginById = new Map<string, string>();
    for (const l of loginsRes.data ?? []) {
      const uid = l.user_id as string;
      if (!lastLoginById.has(uid)) lastLoginById.set(uid, l.created_at as string);
    }

    // Most-recent in-app activity per user (any logged action).
    const lastActiveById = new Map<string, string>();
    for (const a of activityRes.data ?? []) {
      const uid = a.user_id as string;
      if (!lastActiveById.has(uid)) lastActiveById.set(uid, a.created_at as string);
    }

    type AdminUserRow = {
      id: string;
      email: string;
      full_name: string | null;
      role: string;
      created_at: string;
      email_verified: boolean;
      last_login: string | null;
      last_active: string | null;
      status: 'active' | 'suspended';
      total_dashboards: number;
      // Fields that are genuinely client-only (local-first / IndexedDB)
      // architecture and cannot be known server-side, surfaced honestly
      // rather than fabricated:
      total_datasets: 'local_only';
      ai_requests: 'local_only';
      storage_used: 'local_only';
      local_only_mode: 'unknown';
    };

    let rows: AdminUserRow[] = allAuthUsers.map(u => {
      const profile = profileById.get(u.id);
      return {
        id: u.id,
        email: u.email ?? (profile?.email as string | undefined) ?? '',
        full_name: (profile?.full_name as string | null) ?? (u.user_metadata?.full_name as string | undefined) ?? null,
        role: (profile?.role as string | undefined) ?? 'user',
        created_at: u.created_at,
        email_verified: !!u.email_confirmed_at,
        last_login: u.last_sign_in_at ?? lastLoginById.get(u.id) ?? null,
        last_active: lastActiveById.get(u.id) ?? null,
        status: profile?.suspended ? 'suspended' : 'active',
        total_dashboards: dashboardCountById.get(u.id) ?? 0,
        total_datasets: 'local_only',
        ai_requests: 'local_only',
        storage_used: 'local_only',
        local_only_mode: 'unknown',
      };
    });

    // Search by email or name.
    if (search) {
      rows = rows.filter(r =>
        r.email.toLowerCase().includes(search) ||
        (r.full_name ?? '').toLowerCase().includes(search)
      );
    }

    // Newest first.
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = rows.length;
    const start = page * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    return json({ users: pageRows, total, page, page_size: pageSize });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
