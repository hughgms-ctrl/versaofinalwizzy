import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GRAPH_API_BASE } from '../_shared/instagramProvider.ts';

/**
 * Prende as automações de "próxima publicação" ao post que acabou de sair.
 *
 * O caso de uso é o de sempre no Instagram: a pessoa prepara a automação ANTES
 * de publicar, para que o post já nasça respondendo aos comentários. Só que na
 * hora em que ela monta, o post ainda não existe — não há id para escolher.
 *
 * Por que não decidir no momento do comentário: o webhook recebe o media_id,
 * não a data de publicação do post. Descobrir "este post é mais novo que a
 * regra?" custaria uma chamada à Meta POR COMENTÁRIO — num post que viraliza,
 * centenas em minutos, competindo com a cota que envia as DMs.
 *
 * Aqui, ao contrário, é uma chamada a cada cinco minutos por conta que tenha
 * regra esperando. Sem nenhuma regra esperando, nem isso: a função responde sem
 * falar com a Meta.
 *
 * Invocada por pg_cron (agendamento na migration 20260813120000).
 */

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: candidates, error } = await supabase
      .from('instagram_automation_rules')
      .select('id, created_at, trigger_config, instagram_account_id')
      .eq('is_active', true)
      .eq('trigger_type', 'comment_keyword')
      .eq('trigger_config->>scope', 'next_post');

    if (error) throw error;

    // Já vinculadas saem: elas viraram, na prática, regras de post específico.
    const waiting = (candidates || []).filter(
      (rule: any) => !(rule.trigger_config?.media_ids || []).length,
    );

    if (!waiting.length) {
      return jsonResponse({ success: true, waiting: 0, bound: 0 });
    }

    // Uma leitura da lista de mídia por CONTA, não por regra: duas automações
    // esperando o mesmo post são o caso comum (uma para cada palavra-chave).
    const byAccount = new Map<string, any[]>();
    for (const rule of waiting) {
      const list = byAccount.get(rule.instagram_account_id) || [];
      list.push(rule);
      byAccount.set(rule.instagram_account_id, list);
    }

    let bound = 0;
    const errors: string[] = [];

    for (const [accountId, accountRules] of byAccount) {
      try {
        const { data: account } = await supabase
          .from('instagram_accounts')
          .select('id, ig_business_account_id, page_access_token, status')
          .eq('id', accountId)
          .maybeSingle();

        if (!account || account.status !== 'connected' || !account.page_access_token) {
          continue;
        }

        // 10 é folga suficiente: a função roda a cada 5 minutos, e ninguém
        // publica dez posts nesse intervalo.
        const mediaUrl = new URL(`${GRAPH_API_BASE}/${account.ig_business_account_id}/media`);
        mediaUrl.searchParams.set('fields', 'id,timestamp');
        mediaUrl.searchParams.set('limit', '10');
        mediaUrl.searchParams.set('access_token', account.page_access_token);

        const response = await fetch(mediaUrl.toString());
        const json = await response.json().catch(() => null);
        if (!response.ok) {
          errors.push(`conta ${accountId}: ${json?.error?.message || response.status}`);
          continue;
        }

        const posts: Array<{ id: string; timestamp: string }> = (json?.data || [])
          .filter((m: any) => m?.id && m?.timestamp);

        for (const rule of accountRules) {
          // O post mais ANTIGO entre os publicados depois da regra — é esse que
          // "a próxima publicação" quer dizer. Pegar o mais recente prenderia a
          // regra ao terceiro post se três saíssem entre duas execuções.
          const next = posts
            .filter((p) => new Date(p.timestamp).getTime() > new Date(rule.created_at).getTime())
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];

          if (!next) continue;

          const { error: updateError } = await supabase
            .from('instagram_automation_rules')
            .update({
              trigger_config: {
                ...(rule.trigger_config || {}),
                media_ids: [next.id],
                next_post_bound_at: next.timestamp,
              },
            })
            .eq('id', rule.id)
            // Só vincula se ainda estiver esperando. Uma execução que se
            // sobreponha à anterior encontraria a regra já vinculada e a
            // reescreveria com o mesmo id — inofensivo, mas o filtro deixa
            // explícito que o vínculo acontece uma vez só.
            .eq('trigger_config->>scope', 'next_post');

          if (updateError) {
            errors.push(`regra ${rule.id}: ${updateError.message}`);
            continue;
          }
          bound++;
          console.log('[instagram-bind-next-post] regra vinculada', { ruleId: rule.id, mediaId: next.id });
        }
      } catch (accountError) {
        errors.push(`conta ${accountId}: ${String(accountError).slice(0, 200)}`);
      }
    }

    return jsonResponse({ success: true, waiting: waiting.length, bound, errors });
  } catch (error) {
    console.error('[instagram-bind-next-post] error:', error);
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
});
