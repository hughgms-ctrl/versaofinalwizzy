import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    
    if (!code) {
      return new Response(JSON.stringify({ error: 'Authorization code required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'Google OAuth not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-drive-auth`;

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

    // Get user email
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    // Get org_id from state parameter or auth header
    const state = url.searchParams.get('state');
    if (!state) {
      return new Response(JSON.stringify({ error: 'Missing state parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { organization_id } = JSON.parse(atob(state));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Create Wizzy Backup folder in Drive
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

    // Redirect back to app
    const appUrl = Deno.env.get('APP_URL') || 'https://wizzyai.lovable.app';
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: `${appUrl}/integrations?tab=drive&connected=true` },
    });
  } catch (error) {
    console.error('Drive auth error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
