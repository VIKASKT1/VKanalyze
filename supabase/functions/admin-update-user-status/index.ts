// admin-update-user-status
//
// Suspends or re-activates a user's account. Performed via the Service Role
// key server-side (rather than relying solely on the admin RLS policy on
// `profiles`) so this keeps working even if RLS policies change later, and
// so the same JWT-verify -> admin-check -> privileged-action pattern is used
// consistently across every admin user-management action.
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
    const suspended = body.suspended as boolean;
    if (!targetUserId || typeof suspended !== 'boolean') {
      return json({ error: 'user_id and suspended (boolean) are required' }, 400);
    }
    if (targetUserId === caller.id) {
      return json({ error: 'Cannot change your own suspension status' }, 400);
    }

    const { error: updateError } = await adminClient
      .from('profiles')
      .update({ suspended })
      .eq('id', targetUserId);
    if (updateError) return json({ error: updateError.message }, 500);

    // Suspending should also kill any existing active sessions immediately.
    if (suspended) {
      await adminClient.auth.admin.signOut(targetUserId, 'global').catch(() => {});
    }

    await adminClient.from('activity_log').insert({
      user_id: caller.id,
      action: suspended ? 'admin_suspend_user' : 'admin_activate_user',
      dataset_name: null,
      details: `Admin ${caller.id} ${suspended ? 'suspended' : 'activated'} user ${targetUserId}`,
      created_at: new Date().toISOString(),
    });

    return json({ success: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
