import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessError, assertActiveOrganizationAccess } from '../_shared/access.ts';
import { GRAPH_API_BASE } from '../_shared/instagramProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const url = new URL(req.url);
    const organizationId = url.searchParams.get('organizationId') || profile.organization_id;
    await assertActiveOrganizationAccess(supabase, user.id, organizationId, { module: 'integrations' });

    const { data: accounts, error } = await supabase
      .from('instagram_accounts')
      .select('id, ig_business_account_id, ig_username, ig_name, ig_profile_pic_url, facebook_page_id, page_access_token, status, label, is_active, workspace_id, token_expires_at, connected_at, disconnected_at, scopes')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const checked = await Promise.all((accounts || []).map(async (account) => {
      if (account.status !== 'connected') return account;
      try {
        const response = await fetch(
          `${GRAPH_API_BASE}/${account.ig_business_account_id}?fields=id&access_token=${encodeURIComponent(account.page_access_token || '')}`,
        );
        if (!response.ok) {
          await supabase.from('instagram_accounts').update({ status: 'error' }).eq('id', account.id);
          return { ...account, status: 'error', page_access_token: undefined };
        }
        return { ...account, page_access_token: undefined };
      } catch {
        return { ...account, page_access_token: undefined };
      }
    }));

    return new Response(JSON.stringify({ accounts: checked }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.error('[instagram-check-status] error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
