// Deauthorize Callback — required by Meta for Business Login for Instagram.
//
// Meta POSTs here (form-encoded `signed_request`) when a user removes the Wizzy
// app from their Instagram account, either from Instagram's own settings or by
// deleting their account. Since that revocation happens OUTSIDE our product, no
// one calls instagram-disconnect and the row would otherwise sit there marked
// 'connected' forever — the app would keep trying to send DMs with a token Meta
// already invalidated, and the client would see silent failures.
//
// The user identified in the payload is the person who authorized the app (the
// professional account owner), so `user_id` is matched against
// ig_business_account_id — not against instagram_contacts.igsid, which holds the
// *end customers* who message that account.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadInstagramAppConfig, parseSignedRequest } from '../_shared/instagramProvider.ts';

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

// Meta sends the payload form-encoded, but tolerate JSON too — the App
// Dashboard's "send test" button has historically used either.
async function readSignedRequest(req: Request): Promise<string> {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    return String(body?.signed_request || '');
  }
  const form = await req.formData().catch(() => null);
  return String(form?.get('signed_request') || '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const appConfig = await loadInstagramAppConfig(supabase);
    const signedRequest = await readSignedRequest(req);
    const payload = await parseSignedRequest(signedRequest, appConfig.appSecret);

    if (!payload?.user_id) {
      console.error('[instagram-deauthorize] invalid or unverifiable signed_request');
      return jsonResponse({ error: 'invalid signed_request' }, 401);
    }

    const igUserId = String(payload.user_id);

    // Clear the tokens as well as the status: they are dead the moment the user
    // revokes access, and dropping them keeps a revoked credential from sitting
    // in the database.
    const { data: updated, error } = await supabase
      .from('instagram_accounts')
      .update({
        status: 'disconnected',
        is_active: false,
        disconnected_at: new Date().toISOString(),
        page_access_token: null,
        long_lived_user_token: null,
        token_expires_at: null,
      })
      .eq('ig_business_account_id', igUserId)
      .select('id, organization_id');

    if (error) throw error;

    // Recorded in the same table as the inbound webhooks so the account's
    // lifecycle (connect → events → deauthorize) reads as one timeline when
    // debugging "why did this account stop working?".
    await supabase.from('instagram_webhook_events').insert({
      organization_id: updated?.[0]?.organization_id || null,
      instagram_account_id: updated?.[0]?.id || null,
      event_type: 'deauthorize',
      raw_payload: { user_id: igUserId, issued_at: payload.issued_at ?? null },
      processed: true,
      error: updated?.length ? null : 'no_matching_instagram_account',
    });

    if (!updated?.length) {
      console.error('[instagram-deauthorize] no instagram_accounts row for', igUserId);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('[instagram-deauthorize] error:', error);
    // 200 so Meta doesn't retry-storm; the event row above carries the failure
    // for replay, matching instagram-webhook's convention.
    return jsonResponse({ success: false }, 200);
  }
});
