import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Find all waiting_input executions with remarketing_step > 0 where contact already responded
  const { data: active, error } = await supabase
    .from('flow_executions')
    .select('id, conversation_id, remarketing_step, started_at')
    .eq('status', 'waiting_input')
    .gt('remarketing_step', 0);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let canceled = 0;
  for (const exec of (active || [])) {
    // Check if contact responded after follow-ups started
    const { data: recentMsg } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', exec.conversation_id)
      .eq('is_from_bot', false)
      .gt('created_at', exec.started_at)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentMsg) {
      console.log(`[FIX-REMARKETING] Canceling exec ${exec.id}: contact responded`);
      await supabase.from('flow_executions').update({
        status: 'completed',
        timeout_at: null,
        remarketing_step: 0,
        completed_at: new Date().toISOString(),
      }).eq('id', exec.id);
      canceled++;
    }
  }

  return new Response(JSON.stringify({ success: true, canceled, checked: active?.length || 0 }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
