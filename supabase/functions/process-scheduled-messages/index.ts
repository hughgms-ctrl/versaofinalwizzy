import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveWhatsAppInstance, resolveWorkspaceInstanceBinding, sendWhatsAppMessage } from '../_shared/whatsappProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();

    // Get pending scheduled messages that are due
    const { data: scheduledMessages, error: fetchError } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('next_execution_at', now)
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
      try {
        // Mark as processing
        await supabase
          .from('scheduled_messages')
          .update({ status: 'processing' })
          .eq('id', scheduled.id);

        // Group targets: send straight to the group JID(s), no contact/conversation resolution.
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
          await supabase
            .from('scheduled_messages')
            .update(calculateNextExecution(scheduled))
            .eq('id', scheduled.id);
          processed++;
          continue;
        }

        // Get target contacts
        const contacts = await getTargetContacts(supabase, scheduled);

        if (contacts.length === 0) {
          await supabase
            .from('scheduled_messages')
            .update({ 
              status: 'failed', 
              error_message: 'Nenhum contato encontrado para envio' 
            })
            .eq('id', scheduled.id);
          failed++;
          continue;
        }

      // Process based on content type
        let result: { successCount: number; failCount: number; lastError?: string } = { successCount: 0, failCount: 0 };
        if (scheduled.content_type === 'message') {
          result = await sendMessageToContacts(supabase, scheduled, contacts);
        } else if (scheduled.content_type === 'flow' && scheduled.flow_id) {
          result = await executeFlowForContacts(supabase, scheduled, contacts);
        }

        // If everything failed, mark this execution as failed (so user sees the real status)
        if (result.successCount === 0 && result.failCount > 0) {
          await supabase
            .from('scheduled_messages')
            .update({
              status: 'failed',
              error_message: result.lastError || 'Falha em todos os envios',
              last_executed_at: new Date().toISOString(),
              execution_count: (scheduled.execution_count || 0) + 1,
            })
            .eq('id', scheduled.id);
          failed++;
          continue;
        }

        // Update status and handle recurrence.
        // Sucesso parcial (alguns enviaram, outros falharam) NÃO pode ser
        // escondido: gravamos o resumo em error_message para o usuário ver que
        // parte não foi entregue e QUAL foi o erro real (antes isso era jogado
        // fora e o job aparecia como "enviado" mesmo com a maioria falhando).
        const newStatus = calculateNextExecution(scheduled);
        const partialError = result.failCount > 0
          ? `${result.successCount} enviada(s), ${result.failCount} falharam. Último erro: ${result.lastError || 'desconhecido'}`
          : null;
        await supabase
          .from('scheduled_messages')
          .update({ ...newStatus, error_message: partialError })
          .eq('id', scheduled.id);

        processed++;
      } catch (err: any) {
        console.error(`Error processing scheduled message ${scheduled.id}:`, err);
        await supabase
          .from('scheduled_messages')
          .update({ 
            status: 'failed', 
            error_message: err.message || 'Erro ao processar' 
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
        total: scheduledMessages.length
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

async function getTargetContacts(
  supabase: any, 
  scheduled: ScheduledMessage
): Promise<Contact[]> {
  if (scheduled.target_type === 'single' && scheduled.contact_id) {
    const { data } = await supabase
      .from('contacts')
      .select('id, phone, organization_id')
      .eq('id', scheduled.contact_id)
      .single();
    return data ? [data] : [];
  }

  if (scheduled.target_type === 'tag' && scheduled.tag_id) {
    const { data: contactTags } = await supabase
      .from('contact_tags')
      .select('contact_id')
      .eq('tag_id', scheduled.tag_id);

    if (!contactTags || contactTags.length === 0) return [];

    const contactIds = contactTags.map((ct: any) => ct.contact_id);
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, phone, organization_id')
      .in('id', contactIds);
    return contacts || [];
  }

  if (scheduled.target_type === 'manual') {
    const { data: manualContacts } = await supabase
      .from('scheduled_message_contacts')
      .select('contact_id, contacts(id, phone, organization_id)')
      .eq('scheduled_message_id', scheduled.id)
      .eq('status', 'pending');

    return (manualContacts || []).map((mc: any) => mc.contacts).filter(Boolean);
  }

  return [];
}

/**
 * FASE 3C: pré-carrega as conversas existentes dos contatos em UMA query e cria
 * as faltantes em UM insert em lote (em vez de 1 SELECT + 1 INSERT por contato).
 * Retorna um Map contact_id → conversation ({ id, whatsapp_instance_id }).
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

    // Insert falhou numa corrida da MESMA instância: recupera a conversa existente.
    // Escopo por instância ativo → o 23505 só ocorre para (contato, org, instância)
    // idêntico; recuperamos com o MESMO filtro de instância (não mesclar números).
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

async function sendMessageToContacts(
  supabase: any,
  scheduled: ScheduledMessage,
  contacts: Contact[],
): Promise<{ successCount: number; failCount: number; lastError?: string }> {
  const delayMs = ((scheduled as any).delay_between_contacts || 0) * 1000;

  let successCount = 0;
  let failCount = 0;
  let lastError: string | undefined;
  const { instance: scheduledInstance, blocked: workspaceBlocked } = await resolveScheduledInstance(supabase, scheduled);
  if (workspaceBlocked) {
    console.error(`[scheduled ${scheduled.id}] ${WORKSPACE_WITHOUT_NUMBER_ERROR}`);
    return { successCount: 0, failCount: contacts.length, lastError: WORKSPACE_WITHOUT_NUMBER_ERROR };
  }
  const scheduledInstanceId = scheduledInstance?.id || null;

  const convByContact = await preloadConversations(supabase, scheduled, contacts, scheduledInstanceId, scheduledInstance);

  // Acumuladores para gravação em lote no fim (1 insert de messages + 1 update de conversas).
  const messagesToInsert: any[] = [];
  const touchedConversationIds = new Set<string>();
  const sentManualContactIds: string[] = [];

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    const conversation = convByContact.get(contact.id);
    try {
      // Delay between contacts (skip first) — throttle anti-bloqueio do WhatsApp.
      if (i > 0 && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      // Sem conversa = falha real (não pular em silêncio, senão o agendamento
      // seria marcado 'sent' sem nada ter sido enviado).
      if (!conversation) {
        failCount++;
        lastError = `Não foi possível obter/criar conversa para o contato ${contact.id}`;
        console.error(`[scheduled ${scheduled.id}] ${lastError}`);
        continue;
      }

      // Send through the configured WhatsApp provider.
      const phone = contact.phone.replace(/\D/g, '');
      let sendType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text';

      if (scheduled.media_url) {
        if (scheduled.media_type?.startsWith('image')) {
          sendType = 'image';
        } else if (scheduled.media_type?.startsWith('audio')) {
          sendType = 'audio';
        } else if (scheduled.media_type?.startsWith('video')) {
          sendType = 'video';
        } else {
          sendType = 'document';
        }
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

      // Acumula a mensagem para insert em lote.
      messagesToInsert.push({
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
      touchedConversationIds.add(conversation.id);
      if (scheduled.target_type === 'manual') sentManualContactIds.push(contact.id);

      successCount++;
    } catch (err: any) {
      console.error(`Error sending to contact ${contact.id}:`, err?.message || err);
      lastError = err?.message || String(err);
      failCount++;
      if (scheduled.target_type === 'manual') {
        await supabase
          .from('scheduled_message_contacts')
          .update({ status: 'failed', error_message: lastError })
          .eq('scheduled_message_id', scheduled.id)
          .eq('contact_id', contact.id);
      }
    }
  }

  // Gravações em lote (1 insert de mensagens, 1 update de conversas, 1 update de status manual).
  if (messagesToInsert.length > 0) {
    const { error: msgErr } = await supabase.from('messages').insert(messagesToInsert);
    if (msgErr) {
      // Fallback por linha: a mensagem já foi ENVIADA no WhatsApp; não podemos
      // perder o registro só porque uma linha do lote falhou.
      console.error(`[scheduled ${scheduled.id}] batch message insert failed, retrying per-row:`, msgErr);
      for (const row of messagesToInsert) {
        const { error: rowErr } = await supabase.from('messages').insert(row);
        if (rowErr) console.error(`[scheduled ${scheduled.id}] message insert failed:`, rowErr);
      }
    }
  }
  if (touchedConversationIds.size > 0) {
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .in('id', [...touchedConversationIds]);
  }
  if (sentManualContactIds.length > 0) {
    await supabase
      .from('scheduled_message_contacts')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('scheduled_message_id', scheduled.id)
      .in('contact_id', sentManualContactIds);
  }

  return { successCount, failCount, lastError };
}

async function executeFlowForContacts(
  supabase: any,
  scheduled: ScheduledMessage,
  contacts: Contact[]
): Promise<{ successCount: number; failCount: number; lastError?: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  let successCount = 0;
  let failCount = 0;
  let lastError: string | undefined;
  const { instance: scheduledInstance, blocked: workspaceBlocked } = await resolveScheduledInstance(supabase, scheduled);
  if (workspaceBlocked) {
    console.error(`[scheduled ${scheduled.id}] ${WORKSPACE_WITHOUT_NUMBER_ERROR}`);
    return { successCount: 0, failCount: contacts.length, lastError: WORKSPACE_WITHOUT_NUMBER_ERROR };
  }
  const scheduledInstanceId = scheduledInstance?.id || null;

  // FASE 3C: pré-carrega/cria conversas em lote (mesma estratégia de sendMessageToContacts).
  const convByContact = await preloadConversations(supabase, scheduled, contacts, scheduledInstanceId, scheduledInstance);

  for (const contact of contacts) {
    try {
      const conversation = convByContact.get(contact.id);
      if (!conversation) continue;

      // Call flow-execute function
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

      // Update contact status in manual selection
      if (scheduled.target_type === 'manual') {
        await supabase
          .from('scheduled_message_contacts')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('scheduled_message_id', scheduled.id)
          .eq('contact_id', contact.id);
      }
      successCount++;
    } catch (err: any) {
      console.error(`Error executing flow for contact ${contact.id}:`, err?.message || err);
      lastError = err?.message || String(err);
      failCount++;
      if (scheduled.target_type === 'manual') {
        await supabase
          .from('scheduled_message_contacts')
          .update({ status: 'failed', error_message: lastError })
          .eq('scheduled_message_id', scheduled.id)
          .eq('contact_id', contact.id);
      }
    }
  }

  return { successCount, failCount, lastError };
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
