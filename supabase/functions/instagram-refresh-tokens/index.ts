// Weekly sweep that keeps connected Instagram accounts alive.
//
// Long-lived tokens expire after 60 days. Nothing refreshed them, so every
// connection died two months after it was made and the client had to redo the
// OAuth — with no warning, and looking exactly like "the automation stopped
// working". Refreshing returns a fresh 60-day token, so a weekly pass means a
// connection never lapses in practice.
//
// Scheduled by pg_cron (see 20260811150000_instagram_queue_lock_and_window.sql).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { refreshLongLivedToken } from '../_shared/instagramProvider.ts';

// Refresh anything expiring within this horizon. Comfortably wider than the
// weekly cadence, so a single skipped run (cron blip, deploy) can't let a token
// slip past its expiry.
const REFRESH_WINDOW_DAYS = 21;

// Meta rejects a refresh on a token less than 24h old. Newly connected accounts
// are simply left for the next weekly pass.
const MIN_TOKEN_AGE_MS = 25 * 60 * 60 * 1000;

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const horizon = new Date(Date.now() + REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: accounts, error } = await supabase
      .from('instagram_accounts')
      .select('id, organization_id, long_lived_user_token, page_access_token, token_expires_at, updated_at')
      .eq('status', 'connected')
      .not('token_expires_at', 'is', null)
      .lte('token_expires_at', horizon);

    if (error) throw error;

    let refreshed = 0;
    let skipped = 0;
    let failed = 0;

    for (const account of accounts || []) {
      const token = account.long_lived_user_token || account.page_access_token;
      if (!token) {
        skipped++;
        continue;
      }

      // Already past expiry: refreshing is impossible, only re-authorization
      // works. Mark it so the UI can tell the client to reconnect instead of
      // leaving them with an account that looks connected but cannot send.
      if (account.token_expires_at && new Date(account.token_expires_at).getTime() <= Date.now()) {
        await supabase
          .from('instagram_accounts')
          .update({ status: 'expired', is_active: false })
          .eq('id', account.id);
        skipped++;
        continue;
      }

      if (account.updated_at && Date.now() - new Date(account.updated_at).getTime() < MIN_TOKEN_AGE_MS) {
        skipped++;
        continue;
      }

      try {
        const { accessToken, expiresIn } = await refreshLongLivedToken(token);
        await supabase
          .from('instagram_accounts')
          .update({
            long_lived_user_token: accessToken,
            // Kept in sync because every send path reads page_access_token.
            page_access_token: accessToken,
            token_expires_at: new Date(Date.now() + (expiresIn || 60 * 24 * 60 * 60) * 1000).toISOString(),
          })
          .eq('id', account.id);
        refreshed++;
      } catch (accountError) {
        console.error('[instagram-refresh-tokens] failed for account', account.id, accountError);
        failed++;
      }
    }

    return new Response(JSON.stringify({ success: true, refreshed, skipped, failed, total: (accounts || []).length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[instagram-refresh-tokens] error:', error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
