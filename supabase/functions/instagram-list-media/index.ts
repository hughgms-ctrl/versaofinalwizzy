import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessError, assertActiveOrganizationAccess } from '../_shared/access.ts';
import { GRAPH_API_BASE } from '../_shared/instagramProvider.ts';

// Lista os posts/reels da conta conectada, para o usuário escolher visualmente
// em qual deles a automação vale.
//
// Antes disto, a tela pedia o "ID do post" digitado à mão — um número de 17
// dígitos que não aparece em lugar nenhum do app do Instagram. Na prática isso
// tornava o escopo por post inutilizável para quem não é técnico, e todo mundo
// deixava a regra valendo para todos os posts.

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return jsonResponse({ error: 'Invalid token' }, 401);

    const url = new URL(req.url);
    const accountId = String(url.searchParams.get('accountId') || '').trim();
    if (!accountId) return jsonResponse({ error: 'accountId é obrigatório' }, 400);

    const { data: account, error: accountError } = await supabase
      .from('instagram_accounts')
      .select('id, organization_id, ig_business_account_id, page_access_token, status')
      .eq('id', accountId)
      .single();

    if (accountError || !account) return jsonResponse({ error: 'Conta não encontrada' }, 404);

    // Autorização pela organização DONA da conta, não pela do usuário: sem
    // isto, um id de conta de outra organização listaria a mídia dela.
    await assertActiveOrganizationAccess(supabase, user.id, account.organization_id, {
      module: 'integrations',
    });

    if (account.status !== 'connected') {
      return jsonResponse({ error: 'Conta Instagram não está conectada', code: 'not_connected' }, 400);
    }

    // `children` traz os itens de um carrossel; sem ele, um post com várias
    // fotos volta sem thumbnail utilizável.
    const fields = [
      'id',
      'caption',
      'media_type',
      'media_url',
      'thumbnail_url',
      'permalink',
      'timestamp',
    ].join(',');

    const limit = Math.min(Number(url.searchParams.get('limit')) || 24, 50);
    const after = url.searchParams.get('after');

    const mediaUrl = new URL(`${GRAPH_API_BASE}/${account.ig_business_account_id}/media`);
    mediaUrl.searchParams.set('fields', fields);
    mediaUrl.searchParams.set('limit', String(limit));
    mediaUrl.searchParams.set('access_token', account.page_access_token);
    if (after) mediaUrl.searchParams.set('after', after);

    const response = await fetch(mediaUrl.toString());
    const json = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('[instagram-list-media] Meta respondeu', response.status, JSON.stringify(json)?.slice(0, 300));
      return jsonResponse({
        error: 'Não foi possível carregar os posts do Instagram',
        details: json?.error?.message || null,
      }, 502);
    }

    const items = (json?.data || []).map((item: any) => ({
      id: item.id,
      caption: item.caption || null,
      mediaType: item.media_type || null,
      // VIDEO não tem media_url utilizável como imagem; thumbnail_url é a capa.
      thumbnailUrl: item.thumbnail_url || item.media_url || null,
      permalink: item.permalink || null,
      timestamp: item.timestamp || null,
    }));

    return jsonResponse({
      items,
      nextCursor: json?.paging?.cursors?.after || null,
      hasMore: !!json?.paging?.next,
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    console.error('[instagram-list-media] error:', error);
    return jsonResponse({ error: error?.message || 'Internal server error' }, 500);
  }
});
