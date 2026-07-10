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
    const { to_email, subject, message } = body as { to_email: string; subject: string; message: string };
    if (!to_email || !subject || !message) return new Response(JSON.stringify({ error: 'to_email, subject, message required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('EMAIL_FROM') ?? 'noreply@vkanalyze.com';
    if (!resendApiKey) return new Response(JSON.stringify({ error: 'Email provider not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const emailRes = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: fromEmail, to: [to_email], subject, text: message, html: `<div style="font-family:sans-serif">${message.replace(/\n/g,'<br>')}</div>` }) });
    if (!emailRes.ok) { const err = await emailRes.text(); return new Response(JSON.stringify({ error: `Email send failed: ${err}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
    await adminClient.from('activity_log').insert({ user_id: caller.id, action: 'admin_contact_user', dataset_name: null, details: `Admin sent email to ${to_email}: ${subject}`, created_at: new Date().toISOString() });
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
