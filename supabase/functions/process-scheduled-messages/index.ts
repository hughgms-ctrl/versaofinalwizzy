import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  target_type: 'single' | 'tag' | 'manual';
  contact_id: string | null;
  tag_id: string | null;
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

        // Get WhatsApp instance for this organization
        const { data: instance } = await supabase
          .from('whatsapp_instances')
          .select('id, zapi_instance_id, zapi_token')
          .eq('organization_id', scheduled.organization_id)
          .eq('status', 'connected')
          .single();

        if (!instance?.zapi_token) {
          await supabase
            .from('scheduled_messages')
            .update({ 
              status: 'failed', 
              error_message: 'WhatsApp não conectado' 
            })
            .eq('id', scheduled.id);
          failed++;
          continue;
        }

      // Process based on content type
        let result: { successCount: number; failCount: number; lastError?: string } = { successCount: 0, failCount: 0 };
        if (scheduled.content_type === 'message') {
          result = await sendMessageToContacts(supabase, scheduled, contacts, instance);
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

        // Update status and handle recurrence
        const newStatus = calculateNextExecution(scheduled);
        await supabase
          .from('scheduled_messages')
          .update(newStatus)
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

async function sendMessageToContacts(
  supabase: any,
  scheduled: ScheduledMessage,
  contacts: Contact[],
  instance: { id: string; zapi_instance_id: string; zapi_token: string }
): Promise<{ successCount: number; failCount: number; lastError?: string }> {
  const uazapiBaseUrl = (Deno.env.get('UAZAPI_BASE_URL') || '').replace(/\/$/, '');
  const delayMs = ((scheduled as any).delay_between_contacts || 0) * 1000;

  let successCount = 0;
  let failCount = 0;
  let lastError: string | undefined;

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    try {
      // Delay between contacts (skip first)
      if (i > 0 && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      // Get or create conversation
      let { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contact.id)
        .maybeSingle();

      if (!conversation) {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            contact_id: contact.id,
            organization_id: contact.organization_id,
            workspace_id: scheduled.workspace_id || null,
            status: 'open'
          })
          .select('id')
          .single();
        conversation = newConv;
      }

      if (!conversation) continue;

      // Send via UAZAPI v2 — endpoints are /send/text and /send/media
      const phone = contact.phone.replace(/\D/g, '');
      let endpoint = '/send/text';
      let body: any = { number: phone, text: scheduled.message_content };

      if (scheduled.media_url) {
        endpoint = '/send/media';
        if (scheduled.media_type?.startsWith('image')) {
          body = { number: phone, file: scheduled.media_url, type: 'image' };
          if (scheduled.message_content) body.caption = scheduled.message_content;
        } else if (scheduled.media_type?.startsWith('audio')) {
          body = { number: phone, file: scheduled.media_url, type: 'audio' };
        } else if (scheduled.media_type?.startsWith('video')) {
          body = { number: phone, file: scheduled.media_url, type: 'video' };
          if (scheduled.message_content) body.caption = scheduled.message_content;
        } else {
          body = { number: phone, file: scheduled.media_url, type: 'document' };
          if (scheduled.message_content) body.caption = scheduled.message_content;
        }
      }

      console.log(`[scheduled ${scheduled.id}] POST ${uazapiBaseUrl}${endpoint} -> ${phone}`);

      const response = await fetch(
        `${uazapiBaseUrl}${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instance.zapi_token,
          },
          body: JSON.stringify(body),
        }
      );

      const responseText = await response.text();
      let uazapiResult: any = null;
      try { uazapiResult = JSON.parse(responseText); } catch { /* keep as text */ }

      if (!response.ok) {
        throw new Error(`UAZAPI ${response.status}: ${responseText.slice(0, 300)}`);
      }

      const zapiMsgId = uazapiResult?.messageId || uazapiResult?.id || uazapiResult?.ID || uazapiResult?.key?.id || null;

      // Save message to database
      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        content: scheduled.message_content,
        type: scheduled.media_url ? (scheduled.media_type?.split('/')[0] || 'document') : 'text',
        media_url: scheduled.media_url,
        direction: 'outbound',
        is_from_bot: true,
        zapi_message_id: zapiMsgId,
        metadata: { source: 'scheduled_message', scheduled_id: scheduled.id, uazapi_response: uazapiResult },
      });

      // Update conversation
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversation.id);

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

  for (const contact of contacts) {
    try {
      // Get or create conversation
      let { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contact.id)
        .maybeSingle();

      if (!conversation) {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            contact_id: contact.id,
            organization_id: contact.organization_id,
            status: 'open'
          })
          .select('id')
          .single();
        conversation = newConv;
      }

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
