-- ============================================================================
-- MONITOR DE DISPARO EM MASSA (scheduled_messages)
-- ============================================================================
-- Cole no SQL Editor do Supabase e vá rodando durante o disparo.
-- Cada bloco é independente: rode o que precisar.
--
-- COMO O MOTOR FUNCIONA (para ler os números certos):
--  - O cron chama process-scheduled-messages a cada minuto.
--  - Cada execução tem orçamento de ~50s. Se não terminar, devolve o job para
--    'pending' e o próximo minuto retoma de onde parou (por isso o status fica
--    alternando entre 'pending' e 'processing' — isso é NORMAL, não é erro).
--  - O progresso por contato fica em scheduled_message_contacts (pending/sent/failed).
--  - A ordem em que os contatos saem NÃO é garantida pelo código (a busca de
--    pendentes não tem ORDER BY). O "próximo contato" abaixo é o candidato mais
--    provável, não uma fila exata.
-- ============================================================================


-- ============================================================================
-- 1) PAINEL PRINCIPAL — visão geral de cada disparo em andamento
-- ============================================================================
-- Rode este a cada 30s. É o que responde: "está andando? falta quanto?"
WITH prog AS (
  SELECT
    smc.scheduled_message_id,
    COUNT(*)                                              AS total,
    COUNT(*) FILTER (WHERE smc.status = 'sent')           AS enviados,
    COUNT(*) FILTER (WHERE smc.status = 'failed')         AS falhas,
    COUNT(*) FILTER (WHERE smc.status = 'pending')        AS pendentes,
    MAX(smc.sent_at)                                      AS ultimo_envio
  FROM scheduled_message_contacts smc
  GROUP BY smc.scheduled_message_id
)
SELECT
  sm.name                                   AS disparo,
  sm.status,
  COALESCE(p.total, 0)                      AS total_contatos,
  COALESCE(p.enviados, 0)                   AS enviados,
  COALESCE(p.falhas, 0)                     AS falhas,
  COALESCE(p.pendentes, 0)                  AS faltam,
  CASE WHEN COALESCE(p.total,0) > 0
       THEN ROUND(100.0 * (p.enviados + p.falhas) / p.total, 1)
       ELSE 0 END                           AS pct_concluido,

  -- Ritmo real: intervalo configurado entre contatos
  COALESCE(sm.delay_between_contacts, 0)    AS delay_seg,

  -- Tempo estimado para terminar, considerando delay + pausas de lote
  CASE
    WHEN COALESCE(p.pendentes, 0) = 0 THEN 'concluído'
    ELSE (
      make_interval(secs =>
        p.pendentes * COALESCE(sm.delay_between_contacts, 0)
        + CASE WHEN COALESCE(sm.batch_size_max, 0) > 0
               -- nº de pausas restantes × duração da pausa
               THEN floor(p.pendentes::numeric / GREATEST(sm.batch_size_max, 1))
                    * COALESCE(sm.batch_pause_minutes, 0) * 60
               ELSE 0 END
      )
    )::text
  END                                       AS estimativa_restante,

  -- Estado de lote (só relevante se batch_size_max > 0)
  sm.batch_size_max                         AS lote_max,
  sm.batch_current_target                   AS lote_alvo_atual,
  sm.batch_sent_count                       AS lote_ja_enviados,
  sm.batch_pause_minutes                    AS pausa_min,
  CASE
    WHEN sm.batch_paused_until IS NULL THEN 'sem pausa'
    WHEN sm.batch_paused_until > now() THEN
      'EM PAUSA — retoma em ' || date_trunc('second', sm.batch_paused_until - now())::text
    ELSE 'pausa expirada (retoma no próximo minuto)'
  END                                       AS pausa_entre_lotes,

  p.ultimo_envio,
  date_trunc('second', now() - p.ultimo_envio) AS tempo_desde_ultimo_envio,
  sm.error_message                          AS erro_resumo,
  sm.updated_at,
  sm.id                                     AS scheduled_id
FROM scheduled_messages sm
LEFT JOIN prog p ON p.scheduled_message_id = sm.id
WHERE sm.status IN ('pending', 'processing')
   OR sm.updated_at > now() - interval '2 hours'   -- inclui os que acabaram de terminar
ORDER BY sm.updated_at DESC;


-- ============================================================================
-- 2) PRÓXIMOS CONTATOS DA FILA + quando cada um deve sair
-- ============================================================================
-- Troque o nome do disparo (ou use o scheduled_id do bloco 1).
-- ATENÇÃO: a ordem aqui é a mais provável (created_at), mas o motor não garante
-- ordenação. Use como previsão, não como certeza absoluta.
WITH alvo AS (
  SELECT *
  FROM scheduled_messages
  WHERE status IN ('pending', 'processing')
  ORDER BY updated_at DESC
  LIMIT 1                                   -- ou: WHERE id = 'COLE_O_ID_AQUI'
),
fila AS (
  SELECT
    smc.contact_id,
    c.name  AS contato,
    c.phone AS telefone,
    ROW_NUMBER() OVER (ORDER BY smc.created_at, smc.id) AS posicao
  FROM scheduled_message_contacts smc
  JOIN contacts c ON c.id = smc.contact_id
  WHERE smc.scheduled_message_id = (SELECT id FROM alvo)
    AND smc.status = 'pending'
)
SELECT
  f.posicao,
  f.contato,
  f.telefone,
  -- espera prevista até este contato sair, contando delay + pausas de lote
  date_trunc('second', make_interval(secs =>
      (f.posicao - 1) * COALESCE(a.delay_between_contacts, 0)
      + CASE WHEN COALESCE(a.batch_size_max, 0) > 0
             THEN floor((f.posicao - 1)::numeric / GREATEST(a.batch_size_max, 1))
                  * COALESCE(a.batch_pause_minutes, 0) * 60
             ELSE 0 END
  ))                                        AS espera_prevista,
  -- horário previsto (soma a pausa em curso, se houver)
  date_trunc('second',
    GREATEST(now(), COALESCE(a.batch_paused_until, now()))
    + make_interval(secs =>
        (f.posicao - 1) * COALESCE(a.delay_between_contacts, 0)
        + CASE WHEN COALESCE(a.batch_size_max, 0) > 0
               THEN floor((f.posicao - 1)::numeric / GREATEST(a.batch_size_max, 1))
                    * COALESCE(a.batch_pause_minutes, 0) * 60
               ELSE 0 END)
  )                                         AS horario_previsto
FROM fila f
CROSS JOIN alvo a
ORDER BY f.posicao
LIMIT 20;


-- ============================================================================
-- 3) ERROS — o que falhou e por quê (agrupado)
-- ============================================================================
-- Agrupa por mensagem de erro para você ver o padrão rápido em vez de ler
-- centenas de linhas iguais.
SELECT
  sm.name                                   AS disparo,
  COALESCE(smc.error_message, '(sem mensagem)') AS erro,
  COUNT(*)                                  AS qtd,
  MIN(c.name)                               AS exemplo_contato,
  MIN(c.phone)                              AS exemplo_telefone,
  MAX(smc.created_at)                       AS mais_recente
FROM scheduled_message_contacts smc
JOIN scheduled_messages sm ON sm.id = smc.scheduled_message_id
JOIN contacts c ON c.id = smc.contact_id
WHERE smc.status = 'failed'
  AND sm.updated_at > now() - interval '6 hours'
GROUP BY sm.name, smc.error_message
ORDER BY qtd DESC;


-- ============================================================================
-- 3b) ERROS — detalhe contato a contato (para corrigir número/refazer envio)
-- ============================================================================
SELECT
  sm.name        AS disparo,
  c.name         AS contato,
  c.phone        AS telefone,
  smc.error_message,
  smc.contact_id
FROM scheduled_message_contacts smc
JOIN scheduled_messages sm ON sm.id = smc.scheduled_message_id
JOIN contacts c ON c.id = smc.contact_id
WHERE smc.status = 'failed'
  AND sm.updated_at > now() - interval '6 hours'
ORDER BY sm.updated_at DESC, c.name
LIMIT 100;


-- ============================================================================
-- 4) TRAVOU? — diagnóstico de parada
-- ============================================================================
-- Rode este se o bloco 1 parar de avançar. Ele diz QUAL é o problema.
SELECT
  sm.name AS disparo,
  sm.status,
  date_trunc('second', now() - sm.updated_at) AS parado_ha,
  CASE
    WHEN sm.status = 'sent'   THEN 'OK — disparo concluído'
    WHEN sm.status = 'failed' THEN 'FALHOU: ' || COALESCE(sm.error_message, 'sem detalhe')
    WHEN sm.batch_paused_until > now() THEN
      'NORMAL — pausa entre lotes, retoma em '
      || date_trunc('second', sm.batch_paused_until - now())::text
    WHEN sm.status = 'processing' AND sm.updated_at < now() - interval '4 minutes' THEN
      'TRAVADO — lock órfão (a função morreu no meio). O próprio cron destrava '
      || 'na próxima execução; se não destravar, veja o bloco 5.'
    WHEN sm.status = 'processing' THEN 'NORMAL — enviando agora'
    WHEN sm.status = 'pending' AND sm.next_execution_at > now() THEN
      'AGUARDANDO horário: faltam ' || date_trunc('second', sm.next_execution_at - now())::text
    WHEN sm.status = 'pending' AND sm.updated_at < now() - interval '3 minutes' THEN
      'SUSPEITO — vencido e sem avanço há minutos. O cron pode não estar rodando. '
      || 'Confira os logs da função process-scheduled-messages.'
    WHEN sm.status = 'pending' THEN 'NORMAL — retomando entre execuções do cron'
    ELSE 'estado não previsto: ' || sm.status
  END AS diagnostico,
  sm.next_execution_at,
  sm.batch_paused_until,
  sm.id AS scheduled_id
FROM scheduled_messages sm
WHERE sm.status IN ('pending', 'processing')
   OR sm.updated_at > now() - interval '2 hours'
ORDER BY sm.updated_at DESC;


-- ============================================================================
-- 5) O NÚMERO ESTÁ OK? — instância que vai enviar
-- ============================================================================
-- Causa muito comum de falha em massa: número desconectado, ou workspace sem
-- número vinculado (aí o motor recusa e NÃO usa outro número da org).
-- O vínculo é workspaces.whatsapp_instance_id. Se o disparo tem workspace_id e
-- esse workspace NÃO tem número vinculado, o motor bloqueia e marca todos os
-- pendentes como falha. Sem workspace_id, cai na instância ativa da org.
SELECT
  sm.name                        AS disparo,
  COALESCE(w.name, '(sem workspace — usa número ativo da org)') AS workspace,
  COALESCE(wi.label, wi.evolution_instance_name, wi.zapi_instance_id) AS instancia,
  wi.phone_number,
  wi.status                      AS status_instancia,
  wi.is_active,
  CASE
    WHEN sm.workspace_id IS NOT NULL AND w.whatsapp_instance_id IS NULL THEN
      'BLOQUEIO — workspace sem número vinculado; TODOS os pendentes viram falha'
    WHEN wi.id IS NULL THEN
      'ATENÇÃO — nenhuma instância conectada encontrada para este disparo'
    WHEN wi.status <> 'connected' THEN
      'ATENÇÃO — instância não conectada (status: ' || wi.status::text || ')'
    ELSE 'OK'
  END                            AS veredito
FROM scheduled_messages sm
LEFT JOIN workspaces w
       ON w.id = sm.workspace_id
      AND w.organization_id = sm.organization_id
LEFT JOIN whatsapp_instances wi
       ON wi.id = COALESCE(
            w.whatsapp_instance_id,
            -- fallback: instância ativa e conectada da org (mesma regra do motor)
            (SELECT i.id FROM whatsapp_instances i
              WHERE i.organization_id = sm.organization_id
                AND i.status = 'connected'
              ORDER BY i.is_active DESC, i.created_at DESC
              LIMIT 1)
          )
WHERE sm.status IN ('pending', 'processing')
ORDER BY sm.updated_at DESC;


-- ============================================================================
-- 6) MENSAGENS REALMENTE GRAVADAS — prova de que saiu
-- ============================================================================
-- Confere no lado das mensagens (não só no controle de progresso): ritmo real
-- de saída nos últimos minutos.
SELECT
  date_trunc('minute', m.created_at) AS minuto,
  COUNT(*)                           AS mensagens_enviadas
FROM messages m
WHERE m.metadata->>'source' = 'scheduled_message'
  AND m.created_at > now() - interval '60 minutes'
GROUP BY 1
ORDER BY 1 DESC;
