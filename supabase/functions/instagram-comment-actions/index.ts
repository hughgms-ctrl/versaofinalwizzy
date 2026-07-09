import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessError, assertActiveOrganizationAccess } from '../_shared/access.ts';
import { likeComment, replyToComment } from '../_shared/instagramProvider.ts';

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

    const body = await req.json().catch(() => ({}));
    const instagramAccountId = String(body.instagramAccountId || body.instagram_account_id || '').trim();
    const commentId = String(body.commentId || body.comment_id || '').trim();
    const action = String(body.action || '').trim();
    const message = String(body.message || '').trim();

    if (!instagramAccountId || !commentId || !['reply', 'like'].includes(action)) {
      return new Response(JSON.stringify({ error: 'instagramAccountId, commentId e action (reply|like) são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (action === 'reply' && !message) {
      return new Response(JSON.stringify({ error: 'message é obrigatório para action=reply' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: account, error: accountError } = await supabase
      .from('instagram_accounts')
      .select('*')
      .eq('id', instagramAccountId)
      .single();

    if (accountError || !account) {
      return new Response(JSON.stringify({ error: 'Conta Instagram não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await assertActiveOrganizationAccess(supabase, user.id, account.organization_id, { module: 'integrations' });

    const result = action === 'reply'
      ? await replyToComment(account, commentId, message)
      : await likeComment(account, commentId);

    if (!result.ok) {
      const status = result.supported === false ? 200 : 502;
      return new Response(JSON.stringify({
        success: false,
        supported: result.supported,
        details: result.responseJson || result.error,
      }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, details: result.responseJson }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.error('[instagram-comment-actions] error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
