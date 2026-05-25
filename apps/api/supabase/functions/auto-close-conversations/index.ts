// Cron job: encerra automaticamente conversas inativas com base em
// `organizations.auto_close_hours` (0 = desligado, padrão 24).
// Critério: status='open', última mensagem é OUTBOUND e foi há mais de N horas.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // 1. Get all orgs with auto_close enabled
    const { data: orgs, error: orgsErr } = await supabase
      .from('organizations')
      .select('id, auto_close_hours')
      .gt('auto_close_hours', 0);

    if (orgsErr) throw orgsErr;

    let totalClosed = 0;
    const perOrg: Array<{ org: string; closed: number }> = [];

    for (const org of orgs || []) {
      const hours = (org as any).auto_close_hours || 24;
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      // 2. Find candidate conversations: open + last_message_at older than cutoff
      const { data: candidates } = await supabase
        .from('conversations')
        .select('id, last_message_at')
        .eq('organization_id', org.id)
        .eq('status', 'open')
        .lt('last_message_at', cutoff)
        .limit(500);

      if (!candidates || candidates.length === 0) continue;

      // 3. For each, verify the last message is OUTBOUND
      const ids = candidates.map((c) => c.id);
      const { data: lastMsgs } = await supabase
        .from('messages')
        .select('conversation_id, direction, created_at')
        .in('conversation_id', ids)
        .order('created_at', { ascending: false });

      const lastDirByConv = new Map<string, string>();
      for (const m of lastMsgs || []) {
        if (!lastDirByConv.has(m.conversation_id)) {
          lastDirByConv.set(m.conversation_id, (m as any).direction);
        }
      }

      const toClose = ids.filter((id) => lastDirByConv.get(id) === 'outbound');
      if (toClose.length === 0) continue;

      const { error: updErr } = await supabase
        .from('conversations')
        .update({ status: 'closed', closed_at: new Date().toISOString() } as any)
        .in('id', toClose);

      if (updErr) {
        console.error('auto-close update failed for org', org.id, updErr);
        continue;
      }

      totalClosed += toClose.length;
      perOrg.push({ org: org.id, closed: toClose.length });
    }

    return new Response(
      JSON.stringify({ ok: true, totalClosed, perOrg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('auto-close error', e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
