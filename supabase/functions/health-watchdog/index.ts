import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { captureToSentry, type SentryLevel } from '../_shared/sentry.ts';

// Vigia de saude do backend — Semana 4 de docs/REVISAO_ESCALA_LANCAMENTO.md.
//
// Roda de 5 em 5 minutos, le UM retrato do banco (RPC wz_health_snapshot) e
// transforma numero em alarme no Sentry. Nada aqui muda estado.
//
// O ponto e o que ele vigia: as coisas que falham EM SILENCIO. Cron que parou
// de rodar nao gera erro em lugar nenhum — simplesmente nada acontece, e o
// follow-up do lead nunca sai. Mensagem presa na fila de reprocesso e uma
// conversa que nunca comecou. Nenhuma das duas aparece num painel de erro.
//
// Cada verificacao tem `fingerprint` fixo: o Sentry agrupa tudo numa issue por
// verificacao, que sobe de novo a cada rodada enquanto o problema durar, em vez
// de abrir uma issue nova por execucao.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Cron critico -> quanto tempo sem sucesso ja e alarme.
 *
 * O teto e sempre varias vezes a agenda do job: uma rodada perdida acontece
 * (deploy, pico), o que nao pode e a sequencia parar.
 */
const CRONS_CRITICOS: Record<string, { segundos: number; porque: string }> = {
  'process-flow-timeouts': {
    segundos: 300,
    porque: 'atraso de fluxo, follow-up e a rede anti-zumbi dependem dele',
  },
  'process-scheduled-messages': {
    segundos: 300,
    porque: 'nenhum disparo agendado sai enquanto ele estiver parado',
  },
  'reprocess-inbound-events': {
    segundos: 900,
    porque: 'mensagem que ficou pendente nao volta para o webhook',
  },
  'auto-close-conversations': {
    segundos: 2400,
    porque: 'conversa encerrada sozinha para de acontecer',
  },
};

const PG_NET_FILA_LIMITE = 1000;

interface Alerta {
  verificacao: string;
  nivel: SentryLevel;
  mensagem: string;
  extra?: Record<string, unknown>;
}

function avaliar(snapshot: any): Alerta[] {
  const alertas: Alerta[] = [];
  const crons = (snapshot?.crons || {}) as Record<string, any>;

  for (const [nome, regra] of Object.entries(CRONS_CRITICOS)) {
    const info = crons[nome];

    if (!info) {
      alertas.push({
        verificacao: 'cron_ausente',
        nivel: 'error',
        mensagem: `Cron ausente: ${nome}`,
        extra: { cron: nome, porque: regra.porque },
      });
      continue;
    }

    if (info.ativo === false) {
      alertas.push({
        verificacao: 'cron_desativado',
        nivel: 'error',
        mensagem: `Cron desativado: ${nome}`,
        extra: { cron: nome, porque: regra.porque },
      });
      continue;
    }

    const segundos = info.segundos_desde_sucesso;
    // `null` = nenhum sucesso na janela de 2 h que o snapshot enxerga.
    if (segundos === null || segundos === undefined || segundos > regra.segundos) {
      alertas.push({
        verificacao: 'cron_parado',
        nivel: 'error',
        mensagem: `Cron sem execucao bem-sucedida: ${nome}`,
        extra: {
          cron: nome,
          segundos_desde_sucesso: segundos,
          limite_segundos: regra.segundos,
          ultimo_sucesso: info.ultimo_sucesso,
          falhas_2h: info.falhas_2h,
          porque: regra.porque,
        },
      });
    }
  }

  // Qualquer cron (nao so os criticos) falhando repetidamente.
  for (const [nome, info] of Object.entries(crons)) {
    if ((info as any)?.falhas_2h >= 5) {
      alertas.push({
        verificacao: 'cron_falhando',
        nivel: 'warning',
        mensagem: `Cron falhando: ${nome}`,
        extra: { cron: nome, falhas_2h: (info as any).falhas_2h },
      });
    }
  }

  if (snapshot?.inbound_pendentes_10min > 0) {
    alertas.push({
      verificacao: 'inbound_pendente',
      nivel: 'error',
      mensagem: 'Mensagens recebidas presas na fila de reprocesso',
      extra: {
        pendentes_ha_mais_de_10min: snapshot.inbound_pendentes_10min,
        mais_antigo: snapshot.inbound_pendente_mais_antigo,
      },
    });
  }

  if (snapshot?.inbound_falhados_24h > 0) {
    alertas.push({
      verificacao: 'inbound_falhado',
      nivel: 'fatal',
      mensagem: 'Mensagens recebidas que esgotaram as tentativas (perdidas)',
      extra: { falhados_24h: snapshot.inbound_falhados_24h },
    });
  }

  if (snapshot?.campaign_queue_presos > 0 || snapshot?.campaign_queue_pendentes_vencidos > 0) {
    alertas.push({
      verificacao: 'campanha_parada',
      nivel: 'error',
      mensagem: 'Fila de campanha parada',
      extra: {
        presos_em_processing: snapshot.campaign_queue_presos,
        pendentes_vencidos: snapshot.campaign_queue_pendentes_vencidos,
      },
    });
  }

  if (snapshot?.flow_executions_zumbis > 0) {
    alertas.push({
      verificacao: 'fluxo_zumbi',
      nivel: 'error',
      mensagem: 'Execucoes de fluxo em running sem batimento (conversa muda)',
      extra: { zumbis: snapshot.flow_executions_zumbis },
    });
  }

  if (snapshot?.agendamentos_atrasados > 0 || snapshot?.agendamentos_presos > 0) {
    alertas.push({
      verificacao: 'agendamento_atrasado',
      nivel: 'error',
      mensagem: 'Disparo agendado vencido sem sair',
      extra: {
        vencidos: snapshot.agendamentos_atrasados,
        presos_em_processing: snapshot.agendamentos_presos,
      },
    });
  }

  if (typeof snapshot?.pg_net_fila === 'number' && snapshot.pg_net_fila > PG_NET_FILA_LIMITE) {
    alertas.push({
      verificacao: 'pg_net_inflando',
      nivel: 'warning',
      mensagem: 'Fila do pg_net crescendo',
      extra: { na_fila: snapshot.pg_net_fila, limite: PG_NET_FILA_LIMITE },
    });
  }

  return alertas;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: snapshot, error } = await supabase.rpc('wz_health_snapshot');

    if (error) {
      // O proprio vigia cego tambem e alarme — senao o silencio dele seria lido
      // como "esta tudo bem".
      await captureToSentry({
        message: 'health-watchdog nao conseguiu ler o retrato de saude',
        level: 'error',
        tags: { check: 'watchdog_cego' },
        fingerprint: ['watchdog', 'snapshot_indisponivel'],
        extra: { erro: error.message },
        serverName: 'health-watchdog',
      });
      return responder({ ok: false, error: error.message }, 500);
    }

    const alertas = avaliar(snapshot);

    for (const alerta of alertas) {
      await captureToSentry({
        message: alerta.mensagem,
        level: alerta.nivel,
        tags: { check: alerta.verificacao },
        // Agrupa por verificacao (e por cron, quando houver): uma issue que
        // volta a subir, nao uma issue nova a cada 5 minutos.
        fingerprint: ['watchdog', alerta.verificacao, String(alerta.extra?.cron || '')],
        extra: alerta.extra,
        serverName: 'health-watchdog',
      });
    }

    console.log(`[WATCHDOG] ${alertas.length} alerta(s):`, alertas.map((a) => a.verificacao).join(', ') || 'nenhum');

    return responder({
      ok: true,
      alertas: alertas.map(({ verificacao, nivel, mensagem, extra }) => ({ verificacao, nivel, mensagem, extra })),
      snapshot,
    });
  } catch (erro) {
    console.error('[WATCHDOG] Falhou:', erro);
    await captureToSentry({
      message: 'health-watchdog quebrou',
      level: 'error',
      tags: { check: 'watchdog_quebrado' },
      fingerprint: ['watchdog', 'excecao'],
      extra: { erro: erro instanceof Error ? erro.message : String(erro) },
      serverName: 'health-watchdog',
    });
    return responder({ ok: false, error: String(erro) }, 500);
  }
});
