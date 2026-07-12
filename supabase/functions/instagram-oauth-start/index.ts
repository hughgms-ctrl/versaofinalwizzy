import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessError, assertActiveOrganizationAccess } from '../_shared/access.ts';
import { buildInstagramAuthorizeUrl, loadInstagramAppConfig, signOAuthState } from '../_shared/instagramProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Permissions for "Instagram API with Instagram Login" (Business Login for
// Instagram — no Facebook Page involved). `instagram_business_manage_messages`
// / `instagram_business_manage_comments` require Advanced Access (App Review)
// before working for accounts without a role on the app — in Development
// mode they work immediately for admins/developers/testers.
const REQUESTED_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
];

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

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const organizationId = String(body.organizationId || body.organization_id || profile.organization_id || '').trim();
    const workspaceId = body.workspaceId || body.workspace_id || null;

    await assertActiveOrganizationAccess(supabase, user.id, organizationId, {
      module: 'integrations',
      requireManager: true,
    });

    const appConfig = await loadInstagramAppConfig(supabase);
    if (!appConfig.appId || !appConfig.appSecret) {
      return new Response(JSON.stringify({
        error: 'Instagram ainda não está configurado neste ambiente (IG_APP_ID/IG_APP_SECRET pendentes).',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Same-origin check for the post-connect redirect: capture the caller's
    // origin now (a same-origin fetch from the SPA) so the callback — which
    // arrives as a top-level redirect from Facebook, with no Origin header of
    // its own — knows where to send the user back, without trusting an
    // arbitrary client-supplied redirect URL (open-redirect risk).
    const origin = req.headers.get('origin') || new URL(req.headers.get('referer') || supabaseUrl).origin;

    const state = await signOAuthState(appConfig.appSecret, {
      organizationId,
      workspaceId,
      userId: user.id,
      origin,
      nonce: crypto.randomUUID(),
      iat: Date.now(),
    });

    const redirectUri = `${supabaseUrl}/functions/v1/instagram-oauth-callback`;
    const authUrl = buildInstagramAuthorizeUrl(appConfig.appId, redirectUri, REQUESTED_SCOPES, state);

    return new Response(JSON.stringify({ url: authUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.error('[instagram-oauth-start] error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
