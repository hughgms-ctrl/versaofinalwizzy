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
    const action = url.searchParams.get('action');
    const code = url.searchParams.get('code');

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-auth`;

    // Step 1: Redirect to Google OAuth
    if (action === 'login') {
      const state = url.searchParams.get('state') || '';
      const scope = 'https://www.googleapis.com/auth/calendar openid email profile';
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${state}`;

      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: authUrl },
      });
    }

    // Step 2: Handle callback
    if (!code) {
      return new Response(JSON.stringify({ error: 'No authorization code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    const state = url.searchParams.get('state');
    if (!state) throw new Error('Missing state');

    const { organization_id, user_id } = JSON.parse(atob(state));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Get user display name from profiles
    let displayName = userInfo.name || userInfo.email;
    if (user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user_id)
        .single();
      if (profile?.full_name) displayName = profile.full_name;
    }

    await supabase.from('calendar_configs').upsert({
      organization_id,
      user_id: user_id || null,
      google_refresh_token: tokens.refresh_token,
      google_access_token: tokens.access_token,
      google_email: userInfo.email,
      display_name: displayName,
      is_connected: true,
    }, { onConflict: 'organization_id,user_id' });

    const appUrl = Deno.env.get('APP_URL') || 'https://wizzyai.lovable.app';
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/integrations?tab=calendar&connected=true` },
    });
  } catch (error) {
    console.error('Calendar auth error:', error);
    const appUrl = Deno.env.get('APP_URL') || 'https://wizzyai.lovable.app';
    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/integrations?tab=calendar&error=${encodeURIComponent(error.message)}` },
    });
  }
});
