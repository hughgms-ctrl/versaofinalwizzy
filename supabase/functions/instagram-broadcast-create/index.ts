import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessError, assertActiveOrganizationAccess, getRequestUser } from '../_shared/access.ts';

/**
 * Monta um disparo de DM e sua lista de destinatários.
 *
 * O público é calculado AQUI, no servidor, e não recebido pronto do navegador.
 * A diferença importa: a única lista legítima é "quem respondeu nas últimas 24
 * horas", e essa regra é da Meta, não nossa. Aceitar uma lista de ids vinda da
 * tela permitiria montar qualquer conjunto no console do navegador e mandar
 * para base fria — o que derruba a conta do CLIENTE, não a nossa.
 *
 * Por isso a tela também não insere em instagram_broadcasts: a política de RLS
 * não dá INSERT a ninguém, e esta função (service role) é o único caminho.
 */

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

/** Teto por disparo. Ver comentário no uso. */
const MAX_RECIPIENTS = 5000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const user = await getRequestUser(req);
    const body = await req.json().catch(() => ({}));

    const accountId = String(body.accountId || '').trim();
    const name = String(body.name || '').trim();
    const message = String(body.message || '').trim();
    const tagIds: string[] = Array.isArray(body.tagIds) ? body.tagIds.filter(Boolean) : [];
    const button = body.button?.url
      ? { label: String(body.button.label || 'Acessar'), url: String(body.button.url) }
      : null;

    if (!accountId || !name || !message) {
      return jsonResponse({ error: 'accountId, name e message são obrigatórios' }, 400);
    }

    const { data: account } = await supabase
      .from('instagram_accounts')
      .select('id, organization_id, workspace_id, status')
      .eq('id', accountId)
      .maybeSingle();

    if (!account) return jsonResponse({ error: 'Conta não encontrada' }, 404);

    // Autorização pela organização DONA da conta, não pela do usuário: sem
    // isto, um id de conta de outra organização dispararia para a base dela.
    await assertActiveOrganizationAccess(supabase, user.id, account.organization_id, {
      module: 'integrations',
    });

    if (account.status !== 'connected') {
      return jsonResponse({ error: 'Conta do Instagram não está conectada', code: 'not_connected' }, 400);
    }

    // ─────────────────────────────────────────────────────────────────────
    // O público
    //
    // Janela de 24h aberta = a pessoa mandou mensagem nas últimas 24 horas.
    // É o único grupo que a Meta permite alcançar com DM comum.
    //
    // 'archived' fica de fora: arquivar é o sinal mais próximo de "não quero
    // mais falar com esta pessoa" que existe hoje no produto, e mandar disparo
    // para uma conversa arquivada é a forma mais rápida de virar denúncia.
    // ─────────────────────────────────────────────────────────────────────
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('instagram_conversations')
      .select('id, contact_id, last_inbound_at, status')
      .eq('instagram_account_id', accountId)
      .neq('status', 'archived')
      .gte('last_inbound_at', windowStart)
      .order('last_inbound_at', { ascending: false })
      .limit(MAX_RECIPIENTS);

    const { data: conversations, error: audienceError } = await query;
    if (audienceError) throw audienceError;

    let eligible = conversations || [];

    // Filtro por etiqueta, quando pedido. Feito depois da janela porque a
    // janela é a regra dura: etiqueta só estreita um conjunto que já é legal.
    if (tagIds.length && eligible.length) {
      const { data: tagged } = await supabase
        .from('instagram_contact_tags')
        .select('instagram_contact_id')
        .in('tag_id', tagIds)
        .in('instagram_contact_id', eligible.map((c: any) => c.contact_id));

      const allowed = new Set((tagged || []).map((t: any) => t.instagram_contact_id));
      eligible = eligible.filter((c: any) => allowed.has(c.contact_id));
    }

    if (!eligible.length) {
      return jsonResponse({
        error: 'Ninguém está alcançável agora',
        code: 'empty_audience',
        detail: 'Só é possível enviar para quem respondeu nas últimas 24 horas.',
      }, 400);
    }

    const { data: broadcast, error: broadcastError } = await supabase
      .from('instagram_broadcasts')
      .insert({
        organization_id: account.organization_id,
        instagram_account_id: accountId,
        workspace_id: account.workspace_id,
        name,
        message,
        button,
        audience: { tag_ids: tagIds, window_hours: 24 },
        status: 'sending',
        total_recipients: eligible.length,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (broadcastError) throw broadcastError;

    // Lote único: 5.000 linhas cabem folgadamente num INSERT, e o teto existe
    // menos por causa do banco e mais porque nenhuma conta do Instagram entrega
    // mais que isso num dia sem chamar atenção da Meta.
    const { error: recipientsError } = await supabase
      .from('instagram_broadcast_recipients')
      .insert(eligible.map((conv: any) => ({
        broadcast_id: broadcast.id,
        organization_id: account.organization_id,
        contact_id: conv.contact_id,
        conversation_id: conv.id,
      })));

    if (recipientsError) {
      // Sem destinatários o disparo é uma casca que ficaria 'sending' para
      // sempre, aparecendo na tela como "em andamento".
      await supabase.from('instagram_broadcasts')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', broadcast.id);
      throw recipientsError;
    }

    return jsonResponse({
      success: true,
      broadcastId: broadcast.id,
      recipients: eligible.length,
    });
  } catch (error: any) {
    if (error instanceof AccessError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    console.error('[instagram-broadcast-create] error:', error);
    return jsonResponse({ error: error?.message || 'Internal server error' }, 500);
  }
});
