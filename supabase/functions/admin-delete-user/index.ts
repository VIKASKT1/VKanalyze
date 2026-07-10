import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const anonClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser();
    if (authError || !caller) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const adminClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: callerProfile } = await adminClient.from('profiles').select('role').eq('id', caller.id).maybeSingle();
    if (callerProfile?.role !== 'admin') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const body = await req.json().catch(() => ({}));
    const targetUserId = body.user_id as string;
    if (!targetUserId) return new Response(JSON.stringify({ error: 'user_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (targetUserId === caller.id) return new Response(JSON.stringify({ error: 'Cannot delete own account' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    // datasets, user_roles, and workspaces use ON DELETE CASCADE and are
    // already guaranteed to be removed by auth.admin.deleteUser() below —
    // intentionally not listed here. Every table below uses ON DELETE SET
    // NULL, so it must be explicitly deleted or the row survives with an
    // orphaned/nulled user_id instead of actually being removed.
    const tables = ['chat_messages','activity_log','dataset_versions','sql_queries','notifications','user_preferences','analysis_sessions','dashboards','shared_dashboards','login_history','feedback','support_tickets','feature_request_votes','contacts','feature_requests','testimonials'];
    for (const table of tables) { await adminClient.from(table).delete().eq('user_id', targetUserId); }
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteError) return new Response(JSON.stringify({ error: deleteError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    await adminClient.from('profiles').delete().eq('id', targetUserId);
    await adminClient.from('activity_log').insert({ user_id: caller.id, action: 'admin_delete_user', dataset_name: null, details: `Admin ${caller.id} deleted user ${targetUserId}`, created_at: new Date().toISOString() });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
