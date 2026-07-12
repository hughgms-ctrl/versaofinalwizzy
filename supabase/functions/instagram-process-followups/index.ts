import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ensureInstagramConversation, sendInstagramMessage } from '../_shared/instagramProvider.ts';

// Invoked every minute by pg_cron (see the manual dashboard setup note at the
// bottom of this file) — mirrors process-scheduled-messages/process-flow-timeouts'
// polling shape: find due rows, act, mark processed. No auth header is sent by
// cron (verify_jwt=false in config.toml, same as those two functions); this
// endpoint takes no meaningful input, so that's an acceptable trust boundary.
Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: dueRows, error } = await supabase
      .from('instagram_pending_followups')
      .select('*, instagram_contacts(*), instagram_automation_rules(instagram_account_id, instagram_accounts(*))')
      .eq('status', 'pending')
      .lte('resume_at', new Date().toISOString())
      .limit(50);

    if (error) throw error;

    let sent = 0;
    let failed = 0;

    for (const row of dueRows || []) {
      try {
        const account = row.instagram_automation_rules?.instagram_accounts;
        const contact = row.instagram_contacts;
        if (!account || !contact) {
          await supabase.from('instagram_pending_followups').update({
            status: 'error',
            error: 'missing_account_or_contact',
            processed_at: new Date().toISOString(),
          }).eq('id', row.id);
          failed++;
          continue;
        }

        let clicked = false;
        if (row.tracked_link_id) {
          const { data: link } = await supabase
            .from('instagram_tracked_links')
            .select('clicked_at')
            .eq('id', row.tracked_link_id)
            .maybeSingle();
          clicked = !!link?.clicked_at;
        }

        const config = row.followup_config || {};
        const text = clicked ? config.clicked_text : config.not_clicked_text;

        if (text) {
          const result = await sendInstagramMessage(account, contact.igsid, text);
          if (result.ok) {
            const conversation = row.conversation_id
              ? { id: row.conversation_id }
              : await ensureInstagramConversation(supabase, account, contact);
            await supabase.from('instagram_messages').insert({
              conversation_id: conversation.id,
              direction: 'outbound',
              type: 'text',
              content: text,
              ig_message_id: result.igMessageId,
              is_from_bot: true,
              metadata: { followup_id: row.id, clicked },
            });
            await supabase.from('instagram_conversations').update({
              last_message_at: new Date().toISOString(),
              last_message_direction: 'outbound',
            }).eq('id', conversation.id);
          } else {
            throw new Error(`send failed: ${result.responseText?.slice(0, 300)}`);
          }
        }

        await supabase.from('instagram_pending_followups').update({
          status: 'sent',
          processed_at: new Date().toISOString(),
        }).eq('id', row.id);
        sent++;
      } catch (rowError) {
        console.error('[instagram-process-followups] row error:', rowError);
        await supabase.from('instagram_pending_followups').update({
          status: 'error',
          error: String(rowError).slice(0, 500),
          processed_at: new Date().toISOString(),
        }).eq('id', row.id);
        failed++;
      }
    }

    return new Response(JSON.stringify({ success: true, sent, failed, total: (dueRows || []).length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[instagram-process-followups] error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// MANUAL DEPLOY NOTE (mirrors 20260618120000_fase5a_pg_cron_retencao.sql's
// convention — cron registration is NOT run via `supabase db push`, apply by
// hand once in the SQL editor after this function is deployed):
//
// SELECT cron.schedule(
//   'instagram-process-followups', '* * * * *',
//   $$ SELECT net.http_post(
//     url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/instagram-process-followups',
//     headers := '{"Content-Type": "application/json"}'::jsonb,
//     body := '{}'::jsonb
//   ); $$
// );
