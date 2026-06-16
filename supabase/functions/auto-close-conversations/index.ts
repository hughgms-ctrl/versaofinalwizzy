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

      // Fecha em um único UPDATE: conversas abertas, inativas além do cutoff e
      // cuja ÚLTIMA mensagem foi OUTBOUND. A direção vem da coluna desnormalizada
      // `last_message_direction` (mantida por trigger — ver migration 20260616120000),
      // eliminando a leitura do histórico inteiro de mensagens (risco de OOM).
      const { data: closed, error: updErr } = await supabase
        .from('conversations')
        .update({ status: 'closed', closed_at: new Date().toISOString() } as any)
        .eq('organization_id', org.id)
        .eq('status', 'open')
        .lt('last_message_at', cutoff)
        .eq('last_message_direction', 'outbound')
        .select('id');

      if (updErr) {
        console.error('auto-close update failed for org', org.id, updErr);
        continue;
      }

      const closedCount = closed?.length || 0;
      if (closedCount === 0) continue;

      totalClosed += closedCount;
      perOrg.push({ org: org.id, closed: closedCount });
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
