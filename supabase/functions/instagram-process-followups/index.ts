import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ensureInstagramConversation,
  reserveInstagramSendSlot,
  sendInstagramMessage,
} from '../_shared/instagramProvider.ts';

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
    // Atomically reserve the due rows (marks them 'sending') before doing any
    // network work. Without this, a batch that outlives the one-minute cron
    // interval gets picked up again by the next run and sent twice.
    const { data: claimedRows, error: claimError } = await supabase
      .rpc('claim_instagram_followups', { p_limit: 50 });

    if (claimError) throw claimError;

    const claimedIds = (claimedRows || []).map((r: any) => r.id);
    if (!claimedIds.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, failed: 0, skipped: 0, total: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // The claim function returns bare rows; re-read with the relations the send
    // needs (the RPC can't express PostgREST's embedding syntax).
    const { data: dueRows, error } = await supabase
      .from('instagram_pending_followups')
      .select('*, instagram_contacts(*), instagram_conversations(last_inbound_at), instagram_automation_rules(instagram_account_id, instagram_accounts(*))')
      .in('id', claimedIds);

    if (error) throw error;

    let sent = 0;
    let failed = 0;
    let skipped = 0;

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

        // Meta only accepts a normal DM while the 24-hour window is open, and
        // the window is opened by the person's own last message — not by ours.
        // The initial comment→DM used up this comment's one private reply, so
        // there's no window-free path left here.
        //
        // Recorded as 'skipped', not 'error': nothing failed technically, the
        // person simply never replied. Marking it as an error would hide real
        // send failures among the routine ones.
        const lastInbound = row.instagram_conversations?.last_inbound_at;
        const windowOpen = lastInbound
          && Date.now() - new Date(lastInbound).getTime() < 24 * 60 * 60 * 1000;

        if (!windowOpen) {
          await supabase.from('instagram_pending_followups').update({
            status: 'skipped',
            error: 'janela_24h_fechada: contato nao respondeu',
            processed_at: new Date().toISOString(),
          }).eq('id', row.id);
          skipped++;
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
          // Cota da conta. Diferente dos outros caminhos, aqui a linha volta
          // para 'pending' em vez de ser descartada: o follow-up tem hora certa
          // mas não é urgente ao segundo, então esperar o próximo minuto é
          // melhor do que perdê-lo. `attempts` não é revertido de propósito —
          // o teto de 3 continua valendo, senão uma conta cronicamente no
          // limite reprocessaria a mesma linha para sempre.
          const hasSlot = await reserveInstagramSendSlot(supabase, account.id, 'followup');
          if (!hasSlot) {
            await supabase.from('instagram_pending_followups').update({
              status: 'pending',
              error: 'aguardando cota de envio da conta',
            }).eq('id', row.id);
            skipped++;
            continue;
          }

          // Addressed by IGSID (not comment_id): the private reply for this
          // comment was already spent on the initial DM, and Meta allows only
          // one per comment. This send is therefore a normal DM and depends on
          // the 24-hour window being open — see the window check above.
          const result = await sendInstagramMessage(account, { id: contact.igsid }, text);
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
        // Back to 'pending' while attempts remain, so a transient failure (a
        // blip at Meta) is retried on the next run instead of being discarded.
        // The claim function's `attempts < 3` ceiling is what stops this from
        // looping forever; at that point the row stays 'error' for good.
        const exhausted = (row.attempts || 0) >= 3;
        await supabase.from('instagram_pending_followups').update({
          status: exhausted ? 'error' : 'pending',
          error: String(rowError).slice(0, 500),
          processed_at: exhausted ? new Date().toISOString() : null,
        }).eq('id', row.id);
        failed++;
      }
    }

    return new Response(JSON.stringify({ success: true, sent, failed, skipped, total: (dueRows || []).length }), {
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

// The cron registration for this function lives in
// supabase/migrations/20260811150000_instagram_queue_lock_and_window.sql.
// It used to be a comment here for manual application, which meant there was no
// way to tell from the repo whether it had ever actually been scheduled.
