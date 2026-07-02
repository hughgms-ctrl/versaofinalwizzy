import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveWhatsAppInstance, resolveWorkspaceInstanceBinding, sendWhatsAppMessage } from '../_shared/whatsappProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Orçamento de tempo por execução do cron. Funções Edge têm limite de wall-clock
// (poucos minutos); um disparo com dezenas de contatos + delay antibloqueio
// pode levar 10-15min. Em vez de tentar tudo numa execução (e estourar o tempo,
// perdendo registros e travando o status em 'processing'), cada execução do cron
// processa contatos até esgotar este orçamento e devolve o job para 'pending';
// o cron (roda a cada minuto) retoma de onde parou usando scheduled_message_contacts.
const MAX_RUN_MS = 50_000;

// Uma linha 'processing' mais antiga que isto é considerada lock órfão (a função
// morreu no meio) e pode ser retomada. Precisa ser MUITO maior que MAX_RUN_MS
// para nunca reprocessar um lote saudável ainda em andamento.
const STALE_LOCK_MS = 4 * 60_000;

// Quantos contatos pendentes buscar por página dentro do lote.
const CONTACT_PAGE_SIZE = 25;

interface ScheduledMessage {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  content_type: 'message' | 'flow';
  message_content: string | null;
  media_url: string | null;
  media_type: string | null;
  flow_id: string | null;
  target_type: 'single' | 'tag' | 'manual' | 'group' | 'groups';
  contact_id: string | null;
  tag_id: string | null;
  group_jids: string[] | null;
  recurrence_type: string;
  recurrence_end_at: string | null;
  scheduled_at: string;
  next_execution_at: string | null;
  execution_count: number;
}

interface Contact {
  id: string;
  phone: string;
  organization_id: string;
}

async function resolveScheduledInstance(
  supabase: any,
  scheduled: ScheduledMessage,
): Promise<{ instance: any; blocked: boolean }> {
  const binding = await resolveWorkspaceInstanceBinding(
    supabase,
    scheduled.organization_id,
    scheduled.workspace_id,
  );

  // Workspace sem número associado: não enviamos por outro número da org.
  if (binding.blocked) {
    return { instance: null, blocked: true };
  }

  const instance = await resolveWhatsAppInstance(
    supabase,
    scheduled.organization_id,
    binding.workspaceInstanceId,
  );
  return { instance, blocked: false };
}

const WORKSPACE_WITHOUT_NUMBER_ERROR =
  'Workspace sem número de WhatsApp conectado. Conecte um número ao workspace para enviar mensagens.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();
    const staleBefore = new Date(Date.now() - STALE_LOCK_MS).toISOString();

    // Busca:
    //  - agendamentos 'pending' já vencidos, e
    //  - locks 'processing' órfãos (função morreu antes de finalizar/liberar).
    // O lote saudável em andamento fica 'processing' por poucos segundos e é
    // sempre < STALE_LOCK_MS, então nunca é repescado por uma execução paralela.
    const { data: scheduledMessages, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select('*')
      .or(
        `and(status.eq.pending,next_execution_at.lte.${now}),` +
        `and(status.eq.processing,updated_at.lt.${staleBefore})`,
      )
      .order('next_execution_at', { ascending: true })
      .limit(50);

    if (fetchError) throw fetchError;

    if (!scheduledMessages || scheduledMessages.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No scheduled messages to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processed = 0;
    let failed = 0;

    for (const scheduled of scheduledMessages as ScheduledMessage[]) {
      // Respeita o orçamento de tempo: se já esgotou, para e deixa o restante
      // para a próxima execução do cron (os jobs continuam 'pending'/'processing').
      if (Date.now() - startedAt > MAX_RUN_MS) break;

      // Lock otimista: só assume o job se ninguém já mudou o status. Como só
      // buscamos 'pending' vencido ou 'processing' órfão, o .in cobre ambos.
      const { data: lockRows } = await supabase
        .from('scheduled_messages')
        .update({ status: 'processing' })
        .eq('id', scheduled.id)
        .in('status', ['pending', 'processing'])
        .select('id');
      if (!lockRows || lockRows.length === 0) continue;

      try {
        // Grupos: envio direto para os JIDs, sem contato/conversa. Poucos itens
        // na prática — mantido em execução única.
        if (scheduled.target_type === 'group' || scheduled.target_type === 'groups') {
          const groupResult = await sendMessageToGroups(supabase, scheduled);
          if (groupResult.successCount === 0 && groupResult.failCount > 0) {
            await supabase
              .from('scheduled_messages')
              .update({
                status: 'failed',
                error_message: groupResult.lastError || 'Falha em todos os envios para grupos',
                last_executed_at: new Date().toISOString(),
                execution_count: (scheduled.execution_count || 0) + 1,
              })
              .eq('id', scheduled.id);
            failed++;
            continue;
          }
          const next = calculateNextExecution(scheduled);
          const partialError = groupResult.failCount > 0
            ? `${groupResult.successCount} enviada(s), ${groupResult.failCount} falharam. Último erro: ${groupResult.lastError || 'desconhecido'}`
            : null;
          await supabase
            .from('scheduled_messages')
            .update({ ...next, error_message: partialError })
            .eq('id', scheduled.id);
          processed++;
          continue;
        }

        // Contatos (single/tag/manual): materializa o progresso em
        // scheduled_message_contacts (se ainda não existir) e processa em lote.
        await ensureProgressRows(supabase, scheduled);

        const batch = await processContactCampaign(supabase, scheduled, startedAt);

        if (batch.done) {
          // Terminou a campanha inteira: finaliza (ou reprograma recorrência).
          const finalStatus = await finalizeCampaign(supabase, scheduled);
          if (finalStatus === 'failed') failed++; else processed++;
        } else {
          // Ainda há contatos pendentes: devolve para 'pending' para o cron
          // retomar no próximo minuto (mantém next_execution_at atual).
          await supabase
            .from('scheduled_messages')
            .update({ status: 'pending' })
            .eq('id', scheduled.id);
          processed++;
        }
      } catch (err: any) {
        console.error(`Error processing scheduled message ${scheduled.id}:`, err);
        await supabase
          .from('scheduled_messages')
          .update({
            status: 'failed',
            error_message: err.message || 'Erro ao processar',
          })
          .eq('id', scheduled.id);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Processing complete',
        processed,
        failed,
        total: scheduledMessages.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in process-scheduled-messages:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Garante que exista uma linha em scheduled_message_contacts por contato-alvo,
 * unificando o rastreamento de progresso de single/tag/manual. Assim o lote
 * consegue retomar entre execuções do cron sem reenviar quem já recebeu.
 * - manual: as linhas já são criadas na tela de agendamento — nada a fazer.
 * - single: cria 1 linha se não houver.
 * - tag: materializa os contatos da tag (uma vez) capturando a membership atual.
 */
async function ensureProgressRows(supabase: any, scheduled: ScheduledMessage): Promise<void> {
  if (scheduled.target_type === 'manual') return;

  const { count } = await supabase
    .from('scheduled_message_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('scheduled_message_id', scheduled.id);
  if ((count || 0) > 0) return;

  let contactIds: string[] = [];
  if (scheduled.target_type === 'single' && scheduled.contact_id) {
    contactIds = [scheduled.contact_id];
  } else if (scheduled.target_type === 'tag' && scheduled.tag_id) {
    contactIds = await fetchTagContactIds(supabase, scheduled.tag_id);
  }

  if (contactIds.length === 0) return;

  const rows = contactIds.map((cid) => ({
    scheduled_message_id: scheduled.id,
    contact_id: cid,
    status: 'pending',
  }));

  // Insere em blocos com ON CONFLICT DO NOTHING (idempotente se rodar 2x).
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from('scheduled_message_contacts')
      .upsert(chunk, { onConflict: 'scheduled_message_id,contact_id', ignoreDuplicates: true });
    if (error) console.error(`[scheduled ${scheduled.id}] ensureProgressRows upsert failed:`, error);
  }
}

// Busca todos os contact_ids de uma tag paginando contact_tags (sem cap de ~1000).
async function fetchTagContactIds(supabase: any, tagId: string): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('contact_tags')
      .select('contact_id')
      .eq('tag_id', tagId)
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('fetchTagContactIds error:', error);
      break;
    }
    if (!data || data.length === 0) break;
    for (const row of data) ids.push(row.contact_id);
    if (data.length < pageSize) break;
  }
  return ids;
}

/**
 * FASE 3C: pré-carrega as conversas existentes dos contatos em UMA query e cria
 * as faltantes (em corrida, recupera a existente). Retorna Map contact_id → conversa.
 */
async function preloadConversations(
  supabase: any,
  scheduled: ScheduledMessage,
  contacts: Contact[],
  scheduledInstanceId: string | null,
  scheduledInstance: any,
): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  const ids = contacts.map((c) => c.id);
  if (ids.length === 0) return map;

  let query = supabase
    .from('conversations')
    .select('id, whatsapp_instance_id, contact_id')
    .in('contact_id', ids);
  query = scheduledInstanceId
    ? query.eq('whatsapp_instance_id', scheduledInstanceId)
    : query.is('whatsapp_instance_id', null);

  const { data: existing } = await query;
  for (const conv of existing || []) {
    if (!map.has(conv.contact_id)) map.set(conv.contact_id, conv);
  }

  // Cria as conversas faltantes uma a uma (NÃO em lote): um insert em lote é
  // tudo-ou-nada — se uma linha colidir com o índice único
  // (contact_id, organization_id, COALESCE(whatsapp_instance_id, zero)), TODAS
  // falhariam e os envios seriam pulados silenciosamente. Em caso de falha,
  // re-SELECT recupera a conversa existente (corrida/colisão) e loga o erro real.
  const missing = contacts.filter((c) => !map.has(c.id));
  for (const c of missing) {
    const { data: created, error: insErr } = await supabase
      .from('conversations')
      .insert({
        contact_id: c.id,
        organization_id: c.organization_id,
        workspace_id: scheduled.workspace_id || null,
        whatsapp_instance_id: scheduledInstanceId,
        source_phone: scheduledInstance?.phone_number || scheduledInstance?.logical_phone || null,
        status: 'open',
      })
      .select('id, whatsapp_instance_id, contact_id')
      .single();

    if (created) {
      map.set(c.id, created);
      continue;
    }

    let again = supabase
      .from('conversations')
      .select('id, whatsapp_instance_id, contact_id')
      .eq('contact_id', c.id)
      .eq('organization_id', c.organization_id);
    again = scheduledInstanceId
      ? again.eq('whatsapp_instance_id', scheduledInstanceId)
      : again.is('whatsapp_instance_id', null);
    const { data: refound } = await again.maybeSingle();

    if (refound) {
      map.set(c.id, refound);
    } else {
      console.error(`[scheduled ${scheduled.id}] could not create/find conversation for contact ${c.id}:`, insErr);
    }
  }

  return map;
}

// Busca uma página de contatos ainda pendentes deste agendamento.
async function fetchPendingContactPage(
  supabase: any,
  scheduledId: string,
  pageSize: number,
): Promise<Contact[]> {
  const { data } = await supabase
    .from('scheduled_message_contacts')
    .select('contact_id, contacts(id, phone, organization_id)')
    .eq('scheduled_message_id', scheduledId)
    .eq('status', 'pending')
    .limit(pageSize);
  return (data || []).map((r: any) => r.contacts).filter(Boolean);
}

async function markContact(
  supabase: any,
  scheduledId: string,
  contactId: string,
  status: 'sent' | 'failed',
  errorMessage?: string,
): Promise<void> {
  await supabase
    .from('scheduled_message_contacts')
    .update({
      status,
      sent_at: status === 'sent' ? new Date().toISOString() : null,
      error_message: errorMessage || null,
    })
    .eq('scheduled_message_id', scheduledId)
    .eq('contact_id', contactId);
}

/**
 * Envia para UM contato e GRAVA a mensagem imediatamente (não acumula pro fim).
 * Isso faz a mensagem aparecer no chat na hora e garante que, se a função for
 * interrompida, o que já saiu no WhatsApp já está registrado no banco.
 */
async function sendOneContact(
  supabase: any,
  scheduled: ScheduledMessage,
  contact: Contact,
  conversation: any,
  scheduledInstanceId: string | null,
): Promise<void> {
  const phone = contact.phone.replace(/\D/g, '');
  let sendType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';
  if (scheduled.media_url) {
    if (scheduled.media_type?.startsWith('image')) sendType = 'image';
    else if (scheduled.media_type?.startsWith('audio')) sendType = 'audio';
    else if (scheduled.media_type?.startsWith('video')) sendType = 'video';
    else sendType = 'document';
  }

  const sendResult = await sendWhatsAppMessage(supabase, {
    organizationId: scheduled.organization_id,
    phone,
    text: scheduled.message_content,
    type: sendType,
    mediaUrl: scheduled.media_url,
    caption: scheduled.message_content,
    conversationInstanceId: conversation.whatsapp_instance_id || scheduledInstanceId,
  });

  console.log(`[scheduled ${scheduled.id}] ${sendResult.provider} -> ${phone}: ${sendResult.status}`);

  if (!sendResult.ok) {
    throw new Error(`${sendResult.provider} ${sendResult.status}: ${sendResult.responseText.slice(0, 300)}`);
  }

  // Grava a mensagem JÁ (aparece no chat na hora).
  const { error: msgErr } = await supabase.from('messages').insert({
    conversation_id: conversation.id,
    content: scheduled.message_content,
    type: scheduled.media_url ? (scheduled.media_type?.split('/')[0] || 'document') : 'text',
    media_url: scheduled.media_url,
    direction: 'outbound',
    is_from_bot: true,
    zapi_message_id: sendResult.zapiMessageId,
    metadata: {
      source: 'scheduled_message',
      scheduled_id: scheduled.id,
      provider: sendResult.provider,
      provider_response: sendResult.responseJson || sendResult.responseText,
    },
  });
  if (msgErr) {
    // A mensagem já foi ENVIADA; logamos mas não derrubamos o envio.
    console.error(`[scheduled ${scheduled.id}] message insert failed for contact ${contact.id}:`, msgErr);
  }

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);
}

async function runFlowForContact(
  scheduled: ScheduledMessage,
  conversation: any,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const r = await fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      flowId: scheduled.flow_id,
      conversationId: conversation.id,
      organizationId: scheduled.organization_id,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`flow-execute ${r.status}: ${t.slice(0, 300)}`);
  }
}

/**
 * Processa contatos pendentes até esgotar o orçamento de tempo.
 * Retorna { done: true } quando não há mais pendentes (campanha completa),
 * ou { done: false } quando parou por tempo (há contatos restantes).
 */
async function processContactCampaign(
  supabase: any,
  scheduled: ScheduledMessage,
  startedAt: number,
): Promise<{ done: boolean }> {
  const { instance: scheduledInstance, blocked: workspaceBlocked } = await resolveScheduledInstance(supabase, scheduled);
  if (workspaceBlocked) {
    console.error(`[scheduled ${scheduled.id}] ${WORKSPACE_WITHOUT_NUMBER_ERROR}`);
    // Marca todos os pendentes como falha para o resumo refletir o motivo real.
    await supabase
      .from('scheduled_message_contacts')
      .update({ status: 'failed', error_message: WORKSPACE_WITHOUT_NUMBER_ERROR })
      .eq('scheduled_message_id', scheduled.id)
      .eq('status', 'pending');
    return { done: true };
  }

  const scheduledInstanceId = scheduledInstance?.id || null;
  const delayMs = ((scheduled as any).delay_between_contacts || 0) * 1000;
  const isFlow = scheduled.content_type === 'flow' && !!scheduled.flow_id;

  let firstSend = true;

  while (true) {
    if (Date.now() - startedAt > MAX_RUN_MS) return { done: false };

    const page = await fetchPendingContactPage(supabase, scheduled.id, CONTACT_PAGE_SIZE);
    if (page.length === 0) return { done: true };

    const convByContact = await preloadConversations(supabase, scheduled, page, scheduledInstanceId, scheduledInstance);

    for (const contact of page) {
      if (Date.now() - startedAt > MAX_RUN_MS) return { done: false };

      // Delay antibloqueio entre envios (pula o primeiro para não gastar orçamento).
      if (!firstSend && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      firstSend = false;

      const conversation = convByContact.get(contact.id);
      if (!conversation) {
        await markContact(supabase, scheduled.id, contact.id, 'failed', `Não foi possível obter/criar conversa para o contato ${contact.id}`);
        continue;
      }

      try {
        if (isFlow) {
          await runFlowForContact(scheduled, conversation);
        } else {
          await sendOneContact(supabase, scheduled, contact, conversation, scheduledInstanceId);
        }
        await markContact(supabase, scheduled.id, contact.id, 'sent');
      } catch (err: any) {
        console.error(`Error sending to contact ${contact.id}:`, err?.message || err);
        await markContact(supabase, scheduled.id, contact.id, 'failed', err?.message || String(err));
      }
    }
  }
}

/**
 * Fecha a campanha após todos os contatos serem processados: calcula o status
 * final (ou a próxima recorrência) e grava o resumo de sucesso/falha parcial.
 * Retorna 'failed' | 'sent-or-recurring'.
 */
async function finalizeCampaign(
  supabase: any,
  scheduled: ScheduledMessage,
): Promise<'failed' | 'sent-or-recurring'> {
  const { count: sentCount } = await supabase
    .from('scheduled_message_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('scheduled_message_id', scheduled.id)
    .eq('status', 'sent');
  const { count: failCount } = await supabase
    .from('scheduled_message_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('scheduled_message_id', scheduled.id)
    .eq('status', 'failed');

  const sent = sentCount || 0;
  const fail = failCount || 0;

  // Puxa a última mensagem de erro real para o resumo.
  let lastError: string | undefined;
  if (fail > 0) {
    const { data: errRow } = await supabase
      .from('scheduled_message_contacts')
      .select('error_message')
      .eq('scheduled_message_id', scheduled.id)
      .eq('status', 'failed')
      .not('error_message', 'is', null)
      .limit(1)
      .maybeSingle();
    lastError = errRow?.error_message || undefined;
  }

  // Nada enviado e houve falha → falha real.
  if (sent === 0 && fail > 0) {
    await supabase
      .from('scheduled_messages')
      .update({
        status: 'failed',
        error_message: lastError || 'Falha em todos os envios',
        last_executed_at: new Date().toISOString(),
        execution_count: (scheduled.execution_count || 0) + 1,
      })
      .eq('id', scheduled.id);
    return 'failed';
  }

  if (sent === 0 && fail === 0) {
    // Nenhum contato-alvo encontrado.
    await supabase
      .from('scheduled_messages')
      .update({ status: 'failed', error_message: 'Nenhum contato encontrado para envio' })
      .eq('id', scheduled.id);
    return 'failed';
  }

  const next = calculateNextExecution(scheduled);
  const partialError = fail > 0
    ? `${sent} enviada(s), ${fail} falharam. Último erro: ${lastError || 'desconhecido'}`
    : null;

  // Recorrência continua: prepara o progresso para a próxima ocorrência.
  if (next.status === 'pending') {
    await resetProgressForRecurrence(supabase, scheduled);
  }

  await supabase
    .from('scheduled_messages')
    .update({ ...next, error_message: partialError })
    .eq('id', scheduled.id);
  return 'sent-or-recurring';
}

// Prepara scheduled_message_contacts para a próxima ocorrência de uma recorrência.
// tag: apaga as linhas (re-materializa na próxima execução, pegando a membership atual).
// single/manual: reseta as linhas existentes para 'pending'.
async function resetProgressForRecurrence(supabase: any, scheduled: ScheduledMessage): Promise<void> {
  if (scheduled.target_type === 'tag') {
    await supabase
      .from('scheduled_message_contacts')
      .delete()
      .eq('scheduled_message_id', scheduled.id);
    return;
  }
  await supabase
    .from('scheduled_message_contacts')
    .update({ status: 'pending', sent_at: null, error_message: null })
    .eq('scheduled_message_id', scheduled.id);
}

async function sendMessageToGroups(
  supabase: any,
  scheduled: ScheduledMessage,
): Promise<{ successCount: number; failCount: number; lastError?: string }> {
  const groupJids = Array.isArray(scheduled.group_jids) ? scheduled.group_jids : [];
  const delayMs = ((scheduled as any).delay_between_contacts || 0) * 1000;

  let successCount = 0;
  let failCount = 0;
  let lastError: string | undefined;

  let sendType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';
  if (scheduled.media_url) {
    if (scheduled.media_type?.startsWith('image')) sendType = 'image';
    else if (scheduled.media_type?.startsWith('audio')) sendType = 'audio';
    else if (scheduled.media_type?.startsWith('video')) sendType = 'video';
    else sendType = 'document';
  }

  for (let i = 0; i < groupJids.length; i++) {
    const groupJid = groupJids[i];
    try {
      if (i > 0 && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      const sendResult = await sendWhatsAppMessage(supabase, {
        organizationId: scheduled.organization_id,
        phone: groupJid,
        isGroup: true,
        text: scheduled.message_content,
        type: sendType,
        mediaUrl: scheduled.media_url,
        caption: scheduled.message_content,
      });

      console.log(`[scheduled ${scheduled.id}] group ${sendResult.provider} -> ${groupJid}: ${sendResult.status}`);

      if (!sendResult.ok) {
        throw new Error(`${sendResult.provider} ${sendResult.status}: ${sendResult.responseText.slice(0, 300)}`);
      }
      successCount++;
    } catch (err: any) {
      console.error(`Error sending to group ${groupJid}:`, err?.message || err);
      lastError = err?.message || String(err);
      failCount++;
    }
  }

  return { successCount, failCount, lastError };
}

function calculateNextExecution(scheduled: ScheduledMessage): Record<string, any> {
  const now = new Date();
  const executionCount = (scheduled.execution_count || 0) + 1;

  // If no recurrence, mark as sent
  if (scheduled.recurrence_type === 'once') {
    return {
      status: 'sent',
      last_executed_at: now.toISOString(),
      execution_count: executionCount,
    };
  }

  // Calculate next execution based on recurrence
  const currentExecution = new Date(scheduled.next_execution_at || scheduled.scheduled_at);
  let nextExecution: Date;

  switch (scheduled.recurrence_type) {
    case 'daily':
      nextExecution = new Date(currentExecution);
      nextExecution.setDate(nextExecution.getDate() + 1);
      break;
    case 'weekly':
      nextExecution = new Date(currentExecution);
      nextExecution.setDate(nextExecution.getDate() + 7);
      break;
    case 'monthly':
      nextExecution = new Date(currentExecution);
      nextExecution.setMonth(nextExecution.getMonth() + 1);
      break;
    default:
      return {
        status: 'sent',
        last_executed_at: now.toISOString(),
        execution_count: executionCount,
      };
  }

  // Check if recurrence has ended
  if (scheduled.recurrence_end_at && nextExecution > new Date(scheduled.recurrence_end_at)) {
    return {
      status: 'sent',
      last_executed_at: now.toISOString(),
      execution_count: executionCount,
    };
  }

  return {
    status: 'pending',
    last_executed_at: now.toISOString(),
    next_execution_at: nextExecution.toISOString(),
    execution_count: executionCount,
  };
}
