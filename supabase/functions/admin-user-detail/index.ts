// admin-user-detail
//
// Backs the "View Profile", "View Activity", and "View Uploaded Datasets"
// admin actions. Returns one user's auth + profile info, their recent
// activity log entries, and any dataset_versions they've saved.
//
// Note on "datasets": VKAnalyze is local-first by design — uploaded files
// are parsed and analyzed entirely in the browser and never reach Supabase
// (see the `datasets` table, which the app never writes to). The closest
// server-side record of "a dataset this user worked with" is
// dataset_versions, populated only when the user explicitly saves a named
// version from the Version History tab. This function returns that — it is
// NOT a complete list of everything the user has uploaded, and the client
// must say so rather than implying otherwise.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser();
    if (authError || !caller) return json({ error: 'Unauthorized' }, 401);

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();
    if (callerProfile?.role !== 'admin') return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.user_id as string;
    const section = (body.section as string) ?? 'profile'; // 'profile' | 'activity' | 'datasets'
    if (!targetUserId) return json({ error: 'user_id required' }, 400);

    const { data: authUser, error: authUserError } = await adminClient.auth.admin.getUserById(targetUserId);
    if (authUserError || !authUser?.user) return json({ error: 'User not found' }, 404);

    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, role, suspended, full_name, created_at')
      .eq('id', targetUserId)
      .maybeSingle();

    const result: Record<string, unknown> = {
      user: {
        id: authUser.user.id,
        email: authUser.user.email,
        full_name: profile?.full_name ?? (authUser.user.user_metadata?.full_name as string | undefined) ?? null,
        role: profile?.role ?? 'user',
        status: profile?.suspended ? 'suspended' : 'active',
        created_at: authUser.user.created_at,
        email_verified: !!authUser.user.email_confirmed_at,
        last_login: authUser.user.last_sign_in_at ?? null,
      },
    };

    if (section === 'activity') {
      const { data: activity } = await adminClient
        .from('activity_log')
        .select('action, dataset_name, details, created_at')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(50);
      result.activity = activity ?? [];
    }

    if (section === 'datasets') {
      const { data: versions } = await adminClient
        .from('dataset_versions')
        .select('dataset_name, version_number, label, row_count, column_count, created_at')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(100);
      const { data: dashboards } = await adminClient
        .from('dashboards')
        .select('name, dataset_name, created_at')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(50);
      result.dataset_versions = versions ?? [];
      result.dashboards = dashboards ?? [];
    }

    return json(result);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
