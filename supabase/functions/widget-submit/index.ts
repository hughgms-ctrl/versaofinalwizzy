import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWhatsAppMessage } from '../_shared/whatsappProvider.ts';
import { getClientIp, checkRateLimitDb } from '../_shared/middleware.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface WidgetSubmission {
  widget_id: string;
  name?: string;
  email?: string;
  cpf?: string;
  whatsapp: string;
  custom_fields?: Record<string, unknown>;
  page_url?: string;
  referrer_url?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Rate limit por IP (anti-spam de submissões de widget).
    const clientIp = getClientIp(req);
    if (!(await checkRateLimitDb(supabase, clientIp, { bucket: 'widget-submit', maxRequests: 20, windowSeconds: 60 }))) {
      return new Response(
        JSON.stringify({ success: false, error: 'Muitas solicitações. Aguarde um momento e tente novamente.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: WidgetSubmission = await req.json();
    console.log('[widget-submit] Received submission:', body);

    // Validate required fields
    if (!body.widget_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'widget_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!body.whatsapp) {
      return new Response(
        JSON.stringify({ success: false, error: 'whatsapp is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get widget configuration
    const { data: widget, error: widgetError } = await supabase
      .from('widgets')
      .select('*')
      .eq('id', body.widget_id)
      .single();

    if (widgetError || !widget) {
      console.error('[widget-submit] Widget not found:', widgetError);
      return new Response(
        JSON.stringify({ success: false, error: 'Widget not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!widget.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: 'Widget is inactive' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean phone number
    const cleanPhone = body.whatsapp.replace(/\D/g, '');
    if (cleanPhone.length < 8 || cleanPhone.length > 15) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid phone number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client info
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                      req.headers.get('cf-connecting-ip') || null;
    const userAgent = req.headers.get('user-agent') || null;

    // Create or find contact
    let contactId: string | null = null;
    
    // Check if contact exists
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', widget.organization_id)
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
      
      // Update contact with new info if provided
      const updates: Record<string, unknown> = {};
      if (body.name) updates.name = body.name;
      if (body.email) updates.email = body.email;
      
      if (Object.keys(updates).length > 0) {
        await supabase
          .from('contacts')
          .update(updates)
          .eq('id', contactId);
      }
    } else {
      // Create new contact
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          organization_id: widget.organization_id,
          phone: cleanPhone,
          name: body.name || null,
          email: body.email || null,
          metadata: body.cpf ? { cpf: body.cpf } : null,
        })
        .select()
        .single();

      if (contactError) {
        console.error('[widget-submit] Error creating contact:', contactError);
      } else {
        contactId = newContact.id;
      }
    }

    // Create conversation if configured
    let conversationId: string | null = null;
    
    if (widget.auto_create_conversation && contactId) {
      // Check for existing conversation
      const { data: existingConversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('organization_id', widget.organization_id)
        .eq('contact_id', contactId)
        .is('whatsapp_instance_id', null)
        .maybeSingle();

      if (existingConversation) {
        conversationId = existingConversation.id;
        
        // Reopen if archived
        await supabase
          .from('conversations')
          .update({ status: 'open' })
          .eq('id', conversationId);
      } else {
        // Create new conversation
        const { data: newConversation, error: convError } = await supabase
          .from('conversations')
          .insert({
            organization_id: widget.organization_id,
            contact_id: contactId,
            status: 'open',
            metadata: { source: 'widget', widget_id: widget.id, widget_name: widget.name },
          })
          .select()
          .single();

        if (convError) {
          console.error('[widget-submit] Error creating conversation:', convError);
        } else {
          conversationId = newConversation.id;
        }
      }
    }

    // Create submission record
    const { data: submission, error: submissionError } = await supabase
      .from('widget_submissions')
      .insert({
        widget_id: widget.id,
        organization_id: widget.organization_id,
        contact_id: contactId,
        conversation_id: conversationId,
        submitted_name: body.name || null,
        submitted_email: body.email || null,
        submitted_cpf: body.cpf || null,
        submitted_whatsapp: cleanPhone,
        custom_fields_data: body.custom_fields || null,
        ip_address: ipAddress,
        user_agent: userAgent,
        page_url: body.page_url || null,
        referrer_url: body.referrer_url || null,
        status: 'pending',
      })
      .select()
      .single();

    if (submissionError) {
      console.error('[widget-submit] Error creating submission:', submissionError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save submission' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Always add a detailed note with ALL submitted form data
    if (contactId) {
      let noteContent = `📋 Formulário preenchido via Widget "${widget.name}"\n`;
      noteContent += `📅 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n`;
      if (body.name) noteContent += `👤 Nome: ${body.name}\n`;
      if (body.email) noteContent += `📧 Email: ${body.email}\n`;
      noteContent += `📱 WhatsApp: ${body.whatsapp}\n`;
      if (body.cpf) noteContent += `🪪 CPF: ${body.cpf}\n`;
      if (body.custom_fields && Object.keys(body.custom_fields).length > 0) {
        noteContent += `\n📝 Dados adicionais:\n`;
        for (const [key, value] of Object.entries(body.custom_fields)) {
          noteContent += `• ${key}: ${value}\n`;
        }
      }
      noteContent += `\n📍 Página: ${body.page_url || 'N/A'}`;
      if (body.referrer_url) noteContent += `\n🔗 Referência: ${body.referrer_url}`;

      await supabase
        .from('contact_notes')
        .insert({
          contact_id: contactId,
          organization_id: widget.organization_id,
          content: noteContent,
        });
    }

    // Handle integration type
    if (widget.integration_type === 'send_message' && widget.message_template && conversationId) {
      // Replace variables in template
      let messageContent = widget.message_template
        .replace(/{nome}/g, body.name || '')
        .replace(/{email}/g, body.email || '')
        .replace(/{whatsapp}/g, body.whatsapp || '')
        .replace(/{cpf}/g, body.cpf || '');

      try {
        const sendResult = await sendWhatsAppMessage(supabase, {
          organizationId: widget.organization_id,
          phone: cleanPhone,
          text: messageContent,
          type: 'text',
        });
        console.log('[widget-submit] WhatsApp response:', sendResult.provider, sendResult.status);

        await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            content: messageContent,
            direction: 'outbound',
            type: 'text',
            is_from_bot: true,
            zapi_message_id: sendResult.zapiMessageId,
            metadata: {
              source: 'widget',
              provider: sendResult.provider,
              provider_response: sendResult.responseJson || sendResult.responseText,
            },
            ...(sendResult.ok ? {} : {
              failed_at: new Date().toISOString(),
              error_message: sendResult.responseText || 'Falha ao enviar mensagem do widget',
            }),
          });
      } catch (sendError) {
        console.error('[widget-submit] WhatsApp error:', sendError);
      }
    } else if (widget.integration_type === 'trigger_flow' && widget.flow_id && conversationId) {
      // Create flow execution
      await supabase
        .from('flow_executions')
        .insert({
          flow_id: widget.flow_id,
          conversation_id: conversationId,
          organization_id: widget.organization_id,
          status: 'pending',
          variables: {
            nome: body.name || '',
            email: body.email || '',
            whatsapp: body.whatsapp || '',
            cpf: body.cpf || '',
            ...body.custom_fields,
          },
        });

      console.log('[widget-submit] Flow execution created for flow:', widget.flow_id);
    }

    // Update submission status
    await supabase
      .from('widget_submissions')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', submission.id);

    console.log('[widget-submit] Submission processed successfully:', submission.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        submission_id: submission.id,
        contact_id: contactId,
        conversation_id: conversationId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[widget-submit] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
