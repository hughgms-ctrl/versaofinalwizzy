import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessError, assertActiveOrganizationAccess } from '../_shared/access.ts';
import { GRAPH_API_BASE } from '../_shared/instagramProvider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// A Graph API devolve 4xx tanto para "esse token morreu" quanto para coisas
// passageiras (rate limit, instabilidade). Só os códigos de OAuth abaixo
// significam que a única saída é reautorizar a conta.
const DEAD_TOKEN_CODES = new Set([102, 190, 463, 467]);

async function isTokenRejection(response: Response): Promise<boolean> {
  // Indisponibilidade e throttling não dizem nada sobre o token.
  if (response.status >= 500 || response.status === 429) return false;
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    return false;
  }
  const err = body?.error;
  if (!err) return false;
  if (err.type === 'OAuthException') return true;
  return DEAD_TOKEN_CODES.has(Number(err.code));
}

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

    // Uma falha no teste não prova que o token morreu, e marcar 'error' era
    // uma sentença sem volta: nada devolvia a conta para 'connected', o sweep
    // de renovação só olha contas 'connected' e todo envio resolve a conta por
    // 'connected'. Um 500 passageiro da Meta derrubava o módulo inteiro e a
    // tela passava a dizer "Desconectado" para sempre. Agora a conta só cai
    // quando a Meta diz que o token é inválido — e volta sozinha assim que o
    // teste passa de novo.
    const checked = await Promise.all((accounts || []).map(async (account) => {
      const hidden = { ...account, page_access_token: undefined };

      // 'disconnected' é decisão do dono e 'pending' nunca teve token: nada a testar.
      const testable = account.status === 'connected' || account.status === 'error' || account.status === 'expired';
      if (!testable || !account.page_access_token) return hidden;

      let response: Response;
      try {
        response = await fetch(
          `${GRAPH_API_BASE}/${account.ig_business_account_id}?fields=id&access_token=${encodeURIComponent(account.page_access_token)}`,
        );
      } catch {
        // Rede: não dá para concluir nada, então não mexe no estado.
        return hidden;
      }

      if (response.ok) {
        if (account.status === 'connected' && account.is_active) return hidden;
        await supabase
          .from('instagram_accounts')
          .update({ status: 'connected', is_active: true, disconnected_at: null })
          .eq('id', account.id);
        return { ...hidden, status: 'connected', is_active: true, disconnected_at: null };
      }

      if (!(await isTokenRejection(response))) return hidden;

      if (account.status === 'error') return hidden;
      await supabase.from('instagram_accounts').update({ status: 'error' }).eq('id', account.id);
      return { ...hidden, status: 'error' };
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
