import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  reserveInstagramSendSlot,
  sendInstagramButtonMessage,
  sendInstagramMessage,
} from '../_shared/instagramProvider.ts';

/**
 * Drena os disparos pendentes. Invocada a cada minuto pelo pg_cron.
 *
 * Duas coisas que este arquivo faz e que não são óbvias:
 *
 * 1. **Reconfere a janela de 24h na hora do envio.** A lista foi montada quando
 *    o disparo começou; num lote de mil pessoas, a última só é alcançada muitos
 *    minutos depois, e nesse intervalo a janela de alguém fecha. Enviar assim
 *    dá erro na Meta — e erro de janela repetido é sinal de spam para a
 *    plataforma. Quem fechou vira 'skipped', não 'failed': não falhou nada,
 *    a pessoa simplesmente parou de responder.
 *
 * 2. **Respeita a cota da conta como qualquer outro envio.** Um disparo grande
 *    e um post viral acontecem no mesmo dia; se o disparo comesse a cota
 *    inteira, as automações parariam de responder e ninguém entenderia por quê.
 *    Sem cota, a linha volta para 'pending' e espera o próximo minuto.
 */

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: claimedRows, error: claimError } = await supabase
      .rpc('claim_instagram_broadcast_recipients', { p_limit: 40 });
    if (claimError) throw claimError;

    const claimedIds = (claimedRows || []).map((r: any) => r.id);
    if (!claimedIds.length) {
      await closeFinishedBroadcasts(supabase);
      return jsonResponse({ success: true, sent: 0, failed: 0, skipped: 0 });
    }

    // A função de reserva devolve linhas cruas; reler com as relações que o
    // envio precisa (o RPC não expressa a sintaxe de embedding do PostgREST).
    const { data: rows, error } = await supabase
      .from('instagram_broadcast_recipients')
      .select(`
        *,
        instagram_contacts(id, igsid),
        instagram_conversations(id, last_inbound_at, status),
        instagram_broadcasts(id, message, button, instagram_account_id, organization_id,
          instagram_accounts(*))
      `)
      .in('id', claimedIds);
    if (error) throw error;

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of rows || []) {
      const broadcast = row.instagram_broadcasts;
      const account = broadcast?.instagram_accounts;
      const contact = row.instagram_contacts;
      const conversation = row.instagram_conversations;

      try {
        if (!broadcast || !account || !contact || !conversation) {
          await finish(supabase, row, 'failed', 'registro incompleto');
          failed++;
          continue;
        }

        const lastInbound = conversation.last_inbound_at;
        const windowOpen = lastInbound
          && Date.now() - new Date(lastInbound).getTime() < 24 * 60 * 60 * 1000;

        if (!windowOpen || conversation.status === 'archived') {
          await finish(
            supabase, row, 'skipped',
            conversation.status === 'archived'
              ? 'conversa arquivada'
              : 'janela de 24h fechou antes da vez desta pessoa',
          );
          skipped++;
          continue;
        }

        const hasSlot = await reserveInstagramSendSlot(supabase, account.id, 'broadcast');
        if (!hasSlot) {
          // Volta para a fila. `attempts` NÃO é revertido de propósito: o teto
          // de 3 continua valendo, senão uma conta cronicamente no limite
          // reprocessaria a mesma linha para sempre.
          await supabase.from('instagram_broadcast_recipients').update({
            status: 'pending',
            error: 'aguardando cota de envio da conta',
          }).eq('id', row.id);
          skipped++;
          continue;
        }

        // O link do disparo é rastreado como o das automações: sem isso não há
        // como responder "quantos clicaram", que é a primeira pergunta de quem
        // dispara.
        let trackedLinkId: string | null = row.tracked_link_id;
        let redirectUrl: string | null = null;
        if (broadcast.button?.url) {
          if (!trackedLinkId) {
            const { data: link } = await supabase
              .from('instagram_tracked_links')
              .insert({
                organization_id: broadcast.organization_id,
                contact_id: contact.id,
                destination_url: broadcast.button.url,
                link_message: broadcast.message,
                link_label: broadcast.button.label || 'Acessar',
              })
              .select('id')
              .single();
            trackedLinkId = link?.id || null;
          }
          redirectUrl = `${supabaseUrl}/functions/v1/instagram-link-redirect?id=${trackedLinkId}`;
        }

        const result = redirectUrl
          ? await sendInstagramButtonMessage(
              account, { id: contact.igsid }, broadcast.message,
              broadcast.button.label || 'Acessar', redirectUrl,
            )
          : await sendInstagramMessage(account, { id: contact.igsid }, broadcast.message);

        if (!result.ok) {
          throw new Error(`envio recusado: ${result.responseText?.slice(0, 300)}`);
        }

        await supabase.from('instagram_messages').insert({
          conversation_id: conversation.id,
          direction: 'outbound',
          type: 'text',
          content: broadcast.message,
          ig_message_id: result.igMessageId,
          is_from_bot: true,
          metadata: { broadcast_id: broadcast.id, tracked_link_id: trackedLinkId },
        });
        await supabase.from('instagram_conversations').update({
          last_message_at: new Date().toISOString(),
          last_message_direction: 'outbound',
        }).eq('id', conversation.id);

        await supabase.from('instagram_broadcast_recipients').update({
          status: 'sent',
          tracked_link_id: trackedLinkId,
          sent_at: new Date().toISOString(),
          error: null,
        }).eq('id', row.id);
        sent++;
      } catch (rowError) {
        console.error('[instagram-broadcast-send] row error:', rowError);
        // Volta para 'pending' enquanto restam tentativas: uma falha passageira
        // na Meta não deve custar o destinatário.
        const exhausted = (row.attempts || 0) >= 3;
        await supabase.from('instagram_broadcast_recipients').update({
          status: exhausted ? 'failed' : 'pending',
          error: String(rowError).slice(0, 500),
          sent_at: null,
        }).eq('id', row.id);
        if (exhausted) failed++;
      }
    }

    await refreshCounters(supabase, rows || []);
    await closeFinishedBroadcasts(supabase);

    return jsonResponse({ success: true, sent, failed, skipped });
  } catch (error) {
    console.error('[instagram-broadcast-send] error:', error);
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
});

async function finish(supabase: any, row: any, status: string, error: string) {
  await supabase.from('instagram_broadcast_recipients').update({
    status,
    error,
    sent_at: new Date().toISOString(),
  }).eq('id', row.id);
}

/**
 * Recalcula os contadores dos disparos tocados nesta rodada.
 *
 * Contar de novo (em vez de incrementar) é mais caro e é o certo: incrementar
 * de duas execuções concorrentes perde escrita, e um contador errado numa tela
 * de disparo é o tipo de coisa que faz o cliente reenviar tudo achando que não
 * saiu.
 */
async function refreshCounters(supabase: any, rows: any[]) {
  const broadcastIds = [...new Set(rows.map((r) => r.broadcast_id).filter(Boolean))];

  for (const broadcastId of broadcastIds) {
    const counts: Record<string, number> = { sent: 0, failed: 0, skipped: 0 };
    for (const status of Object.keys(counts)) {
      const { count } = await supabase
        .from('instagram_broadcast_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('broadcast_id', broadcastId)
        .eq('status', status);
      counts[status] = count || 0;
    }

    await supabase.from('instagram_broadcasts').update({
      sent_count: counts.sent,
      failed_count: counts.failed,
      skipped_count: counts.skipped,
    }).eq('id', broadcastId);
  }
}

/** Fecha o disparo quando não sobrou ninguém na fila. */
async function closeFinishedBroadcasts(supabase: any) {
  const { data: running } = await supabase
    .from('instagram_broadcasts')
    .select('id')
    .eq('status', 'sending');

  for (const broadcast of running || []) {
    const { count } = await supabase
      .from('instagram_broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('broadcast_id', broadcast.id)
      .in('status', ['pending', 'sending']);

    if ((count || 0) === 0) {
      await supabase.from('instagram_broadcasts').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', broadcast.id);
    }
  }
}
