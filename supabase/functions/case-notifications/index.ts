import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 dias

    // Buscar prazos ainda em aberto dentro do horizonte
    const { data: deadlines, error } = await supabase
      .from('case_deadlines')
      .select('id, case_id, organization_id, title, due_date, is_fatal, notify_days_before')
      .is('completed_at', null)
      .gte('due_date', now.toISOString())
      .lte('due_date', horizon.toISOString());

    if (error) throw error;

    let notified = 0;
    for (const d of deadlines ?? []) {
      const due = new Date(d.due_date);
      const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= (d.notify_days_before ?? 3)) {
        // Buscar caso para pegar o responsável
        const { data: caseData } = await supabase
          .from('cases')
          .select('assignee_id, title')
          .eq('id', d.case_id)
          .maybeSingle();

        if (!caseData?.assignee_id) continue;

        // Registrar log
        await supabase.from('case_activity_log').insert({
          case_id: d.case_id,
          organization_id: d.organization_id,
          action: 'deadline_alert',
          payload: {
            deadline_id: d.id,
            title: d.title,
            due_date: d.due_date,
            days_remaining: diffDays,
            is_fatal: d.is_fatal,
          },
        });
        notified++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, checked: deadlines?.length ?? 0, notified }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('case-notifications error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
