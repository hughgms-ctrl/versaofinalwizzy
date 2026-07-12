import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ensureInstagramContact,
  ensureInstagramConversation,
  likeComment,
  replyToComment,
  sendInstagramButtonMessage,
  sendInstagramMessage,
} from '../_shared/instagramProvider.ts';

const WAIT_UNIT_MS: Record<string, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function interpolate(template: string, vars: Record<string, string | undefined>): string {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] || '');
}

interface StepResult {
  type: string;
  status: 'success' | 'error' | 'skipped';
  detail?: string;
}

async function checkRateLimit(supabase: any, rule: any, contactId: string): Promise<StepResult | null> {
  const rateLimit = rule.rate_limit || {};
  if (!rateLimit.max_per_contact_per_day) return null;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('instagram_rule_executions')
    .select('id', { count: 'exact', head: true })
    .eq('rule_id', rule.id)
    .eq('contact_id', contactId)
    .gte('created_at', since);

  if ((count || 0) >= rateLimit.max_per_contact_per_day) {
    return { type: 'rate_limit', status: 'skipped', detail: 'max_per_contact_per_day atingido' };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Internal-only endpoint — invoked exclusively by instagram-webhook, never by
  // the frontend. Require the service role key as the bearer token (the same
  // convention flow-execute's callers use), rather than accepting any caller.
  const authHeader = req.headers.get('Authorization') || '';
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const ruleId = String(body.ruleId || '').trim();
    const webhookEventId = body.webhookEventId || null;
    const event = body.event || {};

    if (!ruleId || event.type !== 'comment') {
      return jsonResponse({ error: 'ruleId e event.type=comment são obrigatórios (Fase 1)' }, 400);
    }

    const { data: rule, error: ruleError } = await supabase
      .from('instagram_automation_rules')
      .select('*, instagram_accounts(*)')
      .eq('id', ruleId)
      .single();

    if (ruleError || !rule || !rule.is_active) {
      return jsonResponse({ error: 'Regra não encontrada ou inativa' }, 404);
    }

    const account = rule.instagram_accounts;
    const contact = await ensureInstagramContact(supabase, account, event.fromIgsid, event.fromUsername);

    const steps: StepResult[] = [];
    const rateLimitStep = await checkRateLimit(supabase, rule, contact.id);
    if (rateLimitStep) {
      steps.push(rateLimitStep);
      await supabase.from('instagram_rule_executions').insert({
        rule_id: ruleId,
        webhook_event_id: webhookEventId,
        contact_id: contact.id,
        status: 'skipped',
        steps,
      });
      return jsonResponse({ success: true, skipped: true, steps });
    }

    const vars = { username: event.fromUsername || '' };
    let hadError = false;

    for (const action of (rule.actions || [])) {
      try {
        if (action.type === 'like_comment') {
          const result = await likeComment(account, event.commentId);
          steps.push({
            type: 'like_comment',
            status: result.ok ? 'success' : (result.supported === false ? 'skipped' : 'error'),
            detail: result.supported === false ? 'não suportado pela API do Instagram' : undefined,
          });
        } else if (action.type === 'reply_comment_public') {
          const message = interpolate(action.text, vars);
          const result = await replyToComment(account, event.commentId, message);
          steps.push({ type: 'reply_comment_public', status: result.ok ? 'success' : 'error' });
          if (!result.ok) hadError = true;
        } else if (action.type === 'send_dm') {
          const message = interpolate(action.text, vars);
          let trackedLinkId: string | null = null;

          let result;
          if (action.button?.url) {
            const { data: trackedLink } = await supabase
              .from('instagram_tracked_links')
              .insert({
                organization_id: account.organization_id,
                rule_id: ruleId,
                contact_id: contact.id,
                destination_url: action.button.url,
              })
              .select('id')
              .single();
            trackedLinkId = trackedLink?.id || null;
            const redirectUrl = `${supabaseUrl}/functions/v1/instagram-link-redirect?id=${trackedLinkId}`;
            result = await sendInstagramButtonMessage(account, event.fromIgsid, message, action.button.label || 'Ver mais', redirectUrl);
          } else {
            result = await sendInstagramMessage(account, event.fromIgsid, message);
          }

          let conversationId: string | null = null;
          if (result.ok) {
            const conversation = await ensureInstagramConversation(supabase, account, contact);
            conversationId = conversation.id;
            await supabase.from('instagram_messages').insert({
              conversation_id: conversation.id,
              direction: 'outbound',
              type: 'comment_reply',
              content: message,
              ig_message_id: result.igMessageId,
              is_from_bot: true,
              metadata: { comment_id: event.commentId, media_id: event.mediaId },
            });
            await supabase.from('instagram_conversations').update({
              last_message_at: new Date().toISOString(),
              last_message_direction: 'outbound',
            }).eq('id', conversation.id);

            // Schedule the delayed follow-up (picked up every minute by
            // instagram-process-followups) — only once the DM itself sent ok.
            if (action.followup?.waitValue && action.followup?.waitUnit) {
              const waitMs = Number(action.followup.waitValue) * (WAIT_UNIT_MS[action.followup.waitUnit] || WAIT_UNIT_MS.minutes);
              await supabase.from('instagram_pending_followups').insert({
                organization_id: account.organization_id,
                rule_id: ruleId,
                contact_id: contact.id,
                conversation_id: conversationId,
                tracked_link_id: trackedLinkId,
                resume_at: new Date(Date.now() + waitMs).toISOString(),
                followup_config: {
                  clicked_text: interpolate(action.followup.clickedText || '', vars),
                  not_clicked_text: interpolate(action.followup.notClickedText || '', vars),
                },
              });
            }
          }
          steps.push({ type: 'send_dm', status: result.ok ? 'success' : 'error' });
          if (!result.ok) hadError = true;
        } else if (action.type === 'create_contact') {
          steps.push({ type: 'create_contact', status: 'success' });
        } else if (action.type === 'add_tag' && action.tag) {
          const { data: existingTag } = await supabase
            .from('tags')
            .select('id')
            .eq('organization_id', account.organization_id)
            .eq('name', action.tag)
            .maybeSingle();

          const tagId = existingTag?.id || (await supabase
            .from('tags')
            .insert({ organization_id: account.organization_id, name: action.tag })
            .select('id')
            .single()).data?.id;

          if (tagId) {
            await supabase.from('instagram_contact_tags').upsert({
              instagram_contact_id: contact.id,
              tag_id: tagId,
              added_by_type: 'automation',
            }, { onConflict: 'instagram_contact_id,tag_id' });
          }
          steps.push({ type: 'add_tag', status: tagId ? 'success' : 'error' });
        } else if (action.type === 'notify_assignee') {
          // Notification delivery isn't wired up for Instagram yet — tracked as
          // Phase 2 work. Recorded as skipped so the log is honest about it.
          steps.push({ type: 'notify_assignee', status: 'skipped', detail: 'não implementado na Fase 1' });
        } else {
          steps.push({ type: action.type || 'unknown', status: 'skipped', detail: 'ação desconhecida' });
        }
      } catch (actionError) {
        hadError = true;
        steps.push({ type: action.type || 'unknown', status: 'error', detail: String(actionError) });
      }
    }

    await supabase.from('instagram_rule_executions').insert({
      rule_id: ruleId,
      webhook_event_id: webhookEventId,
      contact_id: contact.id,
      status: hadError ? 'error' : 'success',
      steps,
      error: hadError ? 'Uma ou mais ações falharam — ver steps' : null,
    });

    return jsonResponse({ success: !hadError, steps });
  } catch (error) {
    console.error('[instagram-rule-execute] error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
});
