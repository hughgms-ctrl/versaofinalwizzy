import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScheduledMessage {
  id: string;
  organization_id: string;
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
          .select('zapi_instance_id, zapi_token')
          .eq('organization_id', scheduled.organization_id)
          .eq('status', 'connected')
          .single();

        if (!instance?.zapi_instance_id || !instance?.zapi_token) {
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
        if (scheduled.content_type === 'message') {
          await sendMessageToContacts(supabase, scheduled, contacts, instance);
        } else if (scheduled.content_type === 'flow' && scheduled.flow_id) {
          await executeFlowForContacts(supabase, scheduled, contacts);
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
  instance: { zapi_instance_id: string; zapi_token: string }
) {
  const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');
  
  for (const contact of contacts) {
    try {
      // Get or create conversation
      let { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contact.id)
        .single();

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

      // Send via Z-API
      const phone = contact.phone.replace(/\D/g, '');
      let endpoint = 'send-text';
      let body: any = { phone, message: scheduled.message_content };

      if (scheduled.media_url) {
        if (scheduled.media_type?.startsWith('image')) {
          endpoint = 'send-image';
          body = { phone, image: scheduled.media_url, caption: scheduled.message_content };
        } else if (scheduled.media_type?.startsWith('audio')) {
          endpoint = 'send-audio';
          body = { phone, audio: scheduled.media_url };
        } else if (scheduled.media_type?.startsWith('video')) {
          endpoint = 'send-video';
          body = { phone, video: scheduled.media_url, caption: scheduled.message_content };
        } else {
          endpoint = 'send-document/pdf';
          body = { phone, document: scheduled.media_url, fileName: 'documento.pdf' };
        }
      }

      const zapiResponse = await fetch(
        `https://api.z-api.io/instances/${instance.zapi_instance_id}/token/${instance.zapi_token}/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Client-Token': clientToken || '',
          },
          body: JSON.stringify(body),
        }
      );

      if (!zapiResponse.ok) {
        throw new Error(`Z-API error: ${zapiResponse.status}`);
      }

      // Save message to database
      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        content: scheduled.message_content,
        type: scheduled.media_url ? (scheduled.media_type?.split('/')[0] || 'document') : 'text',
        media_url: scheduled.media_url,
        direction: 'outbound',
        is_from_bot: true,
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
    } catch (err: any) {
      console.error(`Error sending to contact ${contact.id}:`, err);
      if (scheduled.target_type === 'manual') {
        await supabase
          .from('scheduled_message_contacts')
          .update({ status: 'failed', error_message: err.message })
          .eq('scheduled_message_id', scheduled.id)
          .eq('contact_id', contact.id);
      }
    }
  }
}

async function executeFlowForContacts(
  supabase: any,
  scheduled: ScheduledMessage,
  contacts: Contact[]
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  
  for (const contact of contacts) {
    try {
      // Get or create conversation
      let { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contact.id)
        .single();

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
      await fetch(`${supabaseUrl}/functions/v1/flow-execute`, {
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

      // Update contact status in manual selection
      if (scheduled.target_type === 'manual') {
        await supabase
          .from('scheduled_message_contacts')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('scheduled_message_id', scheduled.id)
          .eq('contact_id', contact.id);
      }
    } catch (err: any) {
      console.error(`Error executing flow for contact ${contact.id}:`, err);
      if (scheduled.target_type === 'manual') {
        await supabase
          .from('scheduled_message_contacts')
          .update({ status: 'failed', error_message: err.message })
          .eq('scheduled_message_id', scheduled.id)
          .eq('contact_id', contact.id);
      }
    }
  }
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
