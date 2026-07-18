import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { signState, verifyState, getStateSecret } from '../_shared/oauthState.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DriveStatePayload {
  organization_id: string;
  exp?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    // `action` pode vir na query (compat) ou no corpo (supabase.functions.invoke).
    let action = url.searchParams.get('action');
    if (!action && !code && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      action = body?.action ?? null;
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-drive-auth`;

    // ==================================================================
    // Step 1: Iniciar login. Chamado via supabase.functions.invoke (com JWT).
    // A org vem do TOKEN, nunca do cliente; devolvemos authUrl com `state`
    // ASSINADO para o front redirecionar o browser.
    // ==================================================================
    if (action === 'login') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error: userErr } = await userClient.auth.getUser();
      if (userErr || !user) {
        return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: profile } = await userClient
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.organization_id) {
        return new Response(JSON.stringify({ error: 'User has no organization' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const state = await signState({ organization_id: profile.organization_id }, getStateSecret());
      const scope = 'https://www.googleapis.com/auth/drive.file openid email profile';
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;

      return new Response(JSON.stringify({ authUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================================================================
    // Step 2: Callback do Google (redirect com ?code&state).
    // ==================================================================
    if (!code) {
      return new Response(JSON.stringify({ error: 'No authorization code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawState = url.searchParams.get('state');
    if (!rawState) throw new Error('Missing state parameter');

    let statePayload: DriveStatePayload;
    try {
      statePayload = await verifyState<DriveStatePayload>(rawState, getStateSecret());
    } catch (e) {
      console.error('Drive auth: invalid state', e);
      const appUrl = Deno.env.get('APP_URL') || 'https://wizzyai.lovable.app';
      return new Response(null, {
        status: 302,
        headers: { Location: `${appUrl}/integrations?tab=drive&error=invalid_state` },
      });
    }
    const { organization_id } = statePayload;

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) {
      throw new Error(tokens.error_description || tokens.error);
    }

    // Get user info
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Create Wizzy Backup folder
    const folderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Wizzy Backup',
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    const folder = await folderRes.json();

    // Save config
    await supabase.from('drive_configs').upsert({
      organization_id,
      google_refresh_token: tokens.refresh_token,
      google_access_token: tokens.access_token,
      google_email: userInfo.email,
      folder_id: folder.id,
      is_connected: true,
    }, { onConflict: 'organization_id' });

    // Redirect back
    const appUrl = Deno.env.get('APP_URL') || 'https://wizzyai.lovable.app';
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/integrations?tab=drive&connected=true` },
    });
  } catch (error) {
    console.error('Drive auth error:', error);
    const appUrl = Deno.env.get('APP_URL') || 'https://wizzyai.lovable.app';
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/integrations?tab=drive&error=${encodeURIComponent(error.message)}` },
    });
  }
});
