/**
 * delete-user Edge Function
 *
 * Deletes a Supabase Auth user (and all related data) using the service-role key.
 * Only callable by the authenticated user themselves (validated via JWT).
 *
 * Deploy: supabase functions deploy delete-user
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the caller's JWT using the anon client
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.user_id as string;

    // Users may only delete themselves
    if (targetUserId !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service-role client for all privileged operations
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Delete all related data first (cascade-safe order).
    //
    // Note: datasets, user_roles, and workspaces are intentionally NOT
    // listed here — their user_id/owner_id foreign keys use
    // ON DELETE CASCADE, so the database guarantees their removal the
    // moment auth.admin.deleteUser() runs below, regardless of this list.
    //
    // Every table below uses ON DELETE SET NULL instead of CASCADE, which
    // means the database will NOT remove these rows on its own — it will
    // just null out user_id, leaving the row (and its content) behind.
    // They must be explicitly deleted here for "every user-owned record"
    // to actually be removed rather than merely anonymized.
    const tables = [
      'chat_messages',
      'activity_log',
      'dataset_versions',
      'sql_queries',
      'notifications',
      'user_preferences',
      'analysis_sessions',
      'dashboards',
      'shared_dashboards',
      'login_history',
      'feedback',
      'support_tickets',
      'feature_request_votes',
      'contacts',
      'feature_requests',
      'testimonials',
    ];

    for (const table of tables) {
      await adminClient.from(table).delete().eq('user_id', targetUserId);
    }

    // Delete the auth user — this is the critical step
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Delete the profile row last (after auth user is gone)
    await adminClient.from('profiles').delete().eq('id', targetUserId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
