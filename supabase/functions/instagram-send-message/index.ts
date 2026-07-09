import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessError, assertActiveOrganizationAccess } from '../_shared/access.ts';
import { sendInstagramMessage } from '../_shared/instagramProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const conversationId = String(body.conversationId || body.conversation_id || '').trim();
    const text = String(body.text || '').trim();
    if (!conversationId || !text) {
      return new Response(JSON.stringify({ error: 'conversationId e text são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: conversation, error: convError } = await supabase
      .from('instagram_conversations')
      .select('*, instagram_accounts(*), instagram_contacts(*)')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return new Response(JSON.stringify({ error: 'Conversa não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await assertActiveOrganizationAccess(supabase, user.id, conversation.organization_id, {
      module: 'conversations',
    });

    const account = conversation.instagram_accounts;
    const contact = conversation.instagram_contacts;
    if (!account || account.status !== 'connected') {
      return new Response(JSON.stringify({ error: 'Conta Instagram não está conectada' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await sendInstagramMessage(account, contact.igsid, text);
    if (!result.ok) {
      await supabase.from('instagram_messages').insert({
        conversation_id: conversationId,
        direction: 'outbound',
        type: 'text',
        content: text,
        sent_by: user.id,
        failed_at: new Date().toISOString(),
        error_message: result.responseText?.slice(0, 500) || 'Falha ao enviar',
      });
      return new Response(JSON.stringify({ error: 'Falha ao enviar mensagem', details: result.responseJson }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: message } = await supabase.from('instagram_messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      type: 'text',
      content: text,
      ig_message_id: result.igMessageId,
      sent_by: user.id,
      delivered_at: new Date().toISOString(),
    }).select('id').single();

    await supabase.from('instagram_conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_direction: 'outbound',
      unread_count: 0,
    }).eq('id', conversationId);

    return new Response(JSON.stringify({ success: true, messageId: message?.id, igMessageId: result.igMessageId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.error('[instagram-send-message] error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
