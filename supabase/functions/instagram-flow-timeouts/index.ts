import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Retoma execuções de fluxo do Instagram que estavam estacionadas.
//
// Duas situações chegam aqui:
//   waiting_delay — acabou uma espera longa ("mande isto daqui a 2 dias")
//   waiting_input — a pessoa não respondeu dentro do prazo configurado
//
// Chamado a cada minuto pelo pg_cron (agendamento na migration
// 20260812140000). Espelha process-flow-timeouts do WhatsApp.

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Reserva atômica: o cron pode se sobrepor a si mesmo, e retomar a mesma
    // execução duas vezes reenviaria as mensagens do nó seguinte.
    const { data: claimed, error: claimError } = await supabase
      .rpc('claim_instagram_flow_resumes', { p_limit: 25 });

    if (claimError) throw claimError;
    if (!claimed?.length) {
      return new Response(JSON.stringify({ success: true, resumed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let resumed = 0;
    let failed = 0;

    for (const execution of claimed) {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/instagram-flow-execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          // Sem replyText: esta retomada é por tempo, não por resposta. É isso
          // que faz o nó de espera seguir pela saída 'timeout'.
          body: JSON.stringify({ resumeExecutionId: execution.id }),
        });
        if (!response.ok) throw new Error(`flow-execute respondeu ${response.status}`);
        resumed++;
      } catch (error) {
        failed++;
        console.error('[instagram-flow-timeouts] falha ao retomar', execution.id, error);
        // Devolve ao estado estacionado para a próxima varredura tentar de
        // novo. Sem isto a execução ficaria presa em 'running' para sempre,
        // já que nada mais a acordaria.
        //
        // `parked_status` (e não `status`) porque a reserva já trocou o status
        // para 'running' — devolver tudo como waiting_delay faria uma espera
        // por resposta seguir depois pelo caminho de tempo esgotado.
        await supabase.from('instagram_flow_executions').update({
          status: execution.parked_status === 'waiting_input' ? 'waiting_input' : 'waiting_delay',
          error_message: String(error).slice(0, 300),
        }).eq('id', execution.id);
      }
    }

    return new Response(JSON.stringify({ success: true, resumed, failed, total: claimed.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[instagram-flow-timeouts] error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
