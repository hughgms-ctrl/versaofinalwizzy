import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ensureInstagramContact,
  ensureInstagramConversation,
  findInstagramAccountByBusinessId,
  loadInstagramAppConfig,
  verifyWebhookSignature,
} from '../_shared/instagramProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
};

function textResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleMessagingEvent(supabase: any, account: any, messagingEvent: any) {
  const senderId = messagingEvent?.sender?.id;
  const isEcho = messagingEvent?.message?.is_echo === true;
  // Echoes are Meta replaying our own outbound sends back through the webhook —
  // we already record those at send time, so skip to avoid duplicate rows.
  if (!senderId || senderId === account.ig_business_account_id || isEcho) return;

  const messageText = messagingEvent?.message?.text || null;
  const igMessageId = messagingEvent?.message?.mid || null;
  if (!messageText && !messagingEvent?.message?.attachments?.length) return;

  const contact = await ensureInstagramContact(supabase, account, senderId);
  const conversation = await ensureInstagramConversation(supabase, account, contact);

  const attachment = messagingEvent?.message?.attachments?.[0];
  const messageType = attachment?.type === 'image' ? 'image'
    : attachment?.type === 'video' ? 'video'
    : attachment?.type === 'audio' ? 'audio'
    : messagingEvent?.message?.reply_to?.story ? 'story_reply'
    : 'text';

  await supabase.from('instagram_messages').insert({
    conversation_id: conversation.id,
    direction: 'inbound',
    type: messageType,
    content: messageText,
    media_url: attachment?.payload?.url || null,
    ig_message_id: igMessageId,
  });

  await supabase.from('instagram_conversations').update({
    last_message_at: new Date().toISOString(),
    last_message_direction: 'inbound',
    unread_count: (conversation.unread_count || 0) + 1,
  }).eq('id', conversation.id);
}

async function handleCommentChange(
  supabase: any,
  account: any,
  serviceRoleKey: string,
  supabaseUrl: string,
  webhookEventId: string,
  value: any,
) {
  const commentId = value?.id;
  const fromIgsid = value?.from?.id;
  const text = value?.text || '';
  const mediaId = value?.media?.id || null;

  // Skip comments authored by the business account itself (e.g. our own public
  // reply, which also arrives as a `comments` change) to avoid feedback loops.
  if (!commentId || !fromIgsid || fromIgsid === account.ig_business_account_id) return;

  await ensureInstagramContact(supabase, account, fromIgsid, value?.from?.username);

  const { data: rules } = await supabase
    .from('instagram_automation_rules')
    .select('*')
    .eq('instagram_account_id', account.id)
    .eq('trigger_type', 'comment_keyword')
    .eq('is_active', true);

  for (const rule of rules || []) {
    const config = rule.trigger_config || {};
    const scope = config.scope || 'all_posts';
    if (scope === 'specific_media' && mediaId && !(config.media_ids || []).includes(mediaId)) continue;

    const keywords: string[] = (config.keywords || []).map((k: string) => k.toLowerCase().trim()).filter(Boolean);
    if (!keywords.length) continue;
    const lowerText = text.toLowerCase();
    const matches = keywords.map((k) => lowerText.includes(k));
    const isMatch = config.match_type === 'all' ? matches.every(Boolean) : matches.some(Boolean);
    if (!isMatch) continue;

    // Delegate the actual action pipeline (like/reply/DM/tag/...) to
    // instagram-rule-execute, keeping the webhook handler focused on ingest +
    // matching. Awaited (not fire-and-forget) since edge functions don't
    // guarantee background work continues after the response is sent.
    await fetch(`${supabaseUrl}/functions/v1/instagram-rule-execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({
        ruleId: rule.id,
        webhookEventId,
        event: { type: 'comment', commentId, mediaId, text, fromIgsid, fromUsername: value?.from?.username },
      }),
    }).catch((err) => console.error('[instagram-webhook] rule-execute call failed:', err));
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const verifyToken = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const appConfig = await loadInstagramAppConfig(supabase);
    if (mode === 'subscribe' && verifyToken && verifyToken === appConfig.webhookVerifyToken) {
      return textResponse(challenge || '');
    }
    return textResponse('Forbidden', 403);
  }

  if (req.method !== 'POST') {
    return textResponse('Method not allowed', 405);
  }

  const rawBody = await req.text();

  try {
    const appConfig = await loadInstagramAppConfig(supabase);
    const signatureValid = await verifyWebhookSignature(req, rawBody, appConfig.appSecret);
    if (!signatureValid) {
      console.error('[instagram-webhook] invalid signature');
      return jsonResponse({ error: 'invalid signature' }, 401);
    }

    const payload = JSON.parse(rawBody || '{}');
    const entries: any[] = payload?.entry || [];

    for (const entry of entries) {
      const igBusinessAccountId = entry?.id;
      const account = igBusinessAccountId
        ? await findInstagramAccountByBusinessId(supabase, igBusinessAccountId)
        : null;

      const { data: eventRow } = await supabase
        .from('instagram_webhook_events')
        .insert({
          organization_id: account?.organization_id || null,
          instagram_account_id: account?.id || null,
          event_type: entry?.changes?.length ? 'comment' : entry?.messaging?.length ? 'message' : 'unknown',
          raw_payload: entry,
          processed: !!account,
          error: account ? null : 'unrecognized_instagram_account',
        })
        .select('id')
        .single();

      if (!account) {
        console.error('[instagram-webhook] no instagram_accounts row for ig_business_account_id', igBusinessAccountId);
        continue;
      }

      for (const change of entry?.changes || []) {
        if (change.field === 'comments') {
          await handleCommentChange(supabase, account, serviceRoleKey, supabaseUrl, eventRow?.id, change.value);
        }
        // 'mentions' and other change fields land here in later phases.
      }

      for (const messagingEvent of entry?.messaging || []) {
        await handleMessagingEvent(supabase, account, messagingEvent);
      }
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('[instagram-webhook] error:', error);
    // Still return 200 so Meta doesn't retry-storm a payload we can't parse;
    // the raw event (if it got far enough to be logged) is in
    // instagram_webhook_events for replay/debugging.
    return jsonResponse({ success: false }, 200);
  }
});
