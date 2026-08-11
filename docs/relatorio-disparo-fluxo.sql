-- ============================================================================
-- RELATÓRIO PARCIAL DE DISPARO COM FLUXO
-- ============================================================================
-- Disparo: "envio para os q tem a tag mreiexp funil 1"
-- Troque o ID abaixo se for usar em outro disparo.
--
-- COMO LER (importante para não reportar número errado):
--  - "Entregue" = o disparo conseguiu iniciar o fluxo para a pessoa. NÃO é
--    confirmação de leitura nem de entrega no aparelho.
--  - "Respondeu" = existe mensagem inbound do contato DEPOIS do disparo.
--    É a métrica de engajamento real.
--  - "Estágio" = onde a pessoa parou no fluxo (flow_executions.current_node_id).
--    Quem está em nó de espera está aguardando resposta dela.
-- ============================================================================

-- ============================================================================
-- 1) RESUMO EXECUTIVO — os números de capa do relatório
-- ============================================================================
WITH disparo AS (
  SELECT * FROM scheduled_messages
  WHERE id = '26904516-8e8e-42a4-a26d-4cc9d762b356'
),
alvos AS (
  SELECT smc.contact_id, smc.status, smc.sent_at
  FROM scheduled_message_contacts smc, disparo d
  WHERE smc.scheduled_message_id = d.id
),
-- Respostas: mensagem recebida do contato depois do envio para ele.
respostas AS (
  SELECT DISTINCT a.contact_id
  FROM alvos a
  JOIN conversations conv ON conv.contact_id = a.contact_id
  JOIN messages m ON m.conversation_id = conv.id
  WHERE a.status = 'sent'
    AND m.direction = 'inbound'
    AND m.created_at > a.sent_at
)
SELECT
  d.name                                              AS disparo,
  d.status                                            AS status_disparo,
  (SELECT COUNT(*) FROM alvos)                        AS total_na_lista,
  (SELECT COUNT(*) FROM alvos WHERE status = 'sent')  AS entregues,
  (SELECT COUNT(*) FROM alvos WHERE status = 'failed')AS falhas,
  (SELECT COUNT(*) FROM alvos WHERE status = 'pending') AS ainda_na_fila,
  (SELECT COUNT(*) FROM respostas)                    AS responderam,
  CASE WHEN (SELECT COUNT(*) FROM alvos WHERE status = 'sent') > 0
       THEN ROUND(100.0 * (SELECT COUNT(*) FROM respostas)
                  / (SELECT COUNT(*) FROM alvos WHERE status = 'sent'), 1)
       ELSE 0 END                                     AS taxa_resposta_pct,
  (SELECT MIN(sent_at) FROM alvos WHERE sent_at IS NOT NULL) AS primeiro_envio,
  (SELECT MAX(sent_at) FROM alvos WHERE sent_at IS NOT NULL) AS ultimo_envio
FROM disparo d;


-- ============================================================================
-- 2) PESSOAS POR ESTÁGIO DO FLUXO
-- ============================================================================
-- Traduz current_node_id no rótulo do nó (flows.nodes é JSON: id/type/data).
WITH disparo AS (
  SELECT * FROM scheduled_messages
  WHERE id = '26904516-8e8e-42a4-a26d-4cc9d762b356'
),
alvos AS (
  SELECT smc.contact_id
  FROM scheduled_message_contacts smc, disparo d
  WHERE smc.scheduled_message_id = d.id AND smc.status = 'sent'
),
nos AS (  -- explode os nós do fluxo para virar tabela de consulta
  SELECT
    n->>'id'                                   AS node_id,
    n->>'type'                                 AS node_type,
    COALESCE(
      n->'data'->>'label',
      n->'data'->>'title',
      n->>'type'
    )                                          AS node_label
  FROM disparo d
  JOIN flows f ON f.id = d.flow_id
  CROSS JOIN LATERAL jsonb_array_elements(f.nodes::jsonb) AS n
),
exec AS (
  SELECT DISTINCT ON (conv.contact_id)
    conv.contact_id,
    fe.status          AS exec_status,
    fe.current_node_id,
    fe.started_at,
    fe.completed_at
  FROM alvos a
  JOIN conversations conv ON conv.contact_id = a.contact_id
  JOIN flow_executions fe ON fe.conversation_id = conv.id
  JOIN disparo d ON d.flow_id = fe.flow_id
  ORDER BY conv.contact_id, fe.started_at DESC
)
SELECT
  COALESCE(nos.node_label, '(sem nó / não iniciado)') AS estagio,
  nos.node_type                                       AS tipo_do_no,
  e.exec_status                                       AS status_execucao,
  COUNT(*)                                            AS pessoas,
  ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS pct
FROM exec e
LEFT JOIN nos ON nos.node_id = e.current_node_id
GROUP BY nos.node_label, nos.node_type, e.exec_status
ORDER BY pessoas DESC;


-- ============================================================================
-- 3) FUNIL — do envio até a resposta
-- ============================================================================
WITH disparo AS (
  SELECT * FROM scheduled_messages
  WHERE id = '26904516-8e8e-42a4-a26d-4cc9d762b356'
),
alvos AS (
  SELECT smc.contact_id, smc.status, smc.sent_at
  FROM scheduled_message_contacts smc, disparo d
  WHERE smc.scheduled_message_id = d.id
),
respostas AS (
  SELECT DISTINCT a.contact_id
  FROM alvos a
  JOIN conversations conv ON conv.contact_id = a.contact_id
  JOIN messages m ON m.conversation_id = conv.id
  WHERE a.status = 'sent' AND m.direction = 'inbound' AND m.created_at > a.sent_at
),
fluxo_ok AS (
  SELECT DISTINCT conv.contact_id
  FROM alvos a
  JOIN conversations conv ON conv.contact_id = a.contact_id
  JOIN flow_executions fe ON fe.conversation_id = conv.id
  JOIN disparo d ON d.flow_id = fe.flow_id
  WHERE a.status = 'sent'
)
SELECT etapa, pessoas,
       ROUND(100.0 * pessoas / NULLIF(base, 0), 1) AS pct_da_lista
FROM (
  SELECT 1 AS ord, 'Na lista'          AS etapa, (SELECT COUNT(*) FROM alvos) AS pessoas,
         (SELECT COUNT(*) FROM alvos) AS base
  UNION ALL
  SELECT 2, 'Mensagem enviada', (SELECT COUNT(*) FROM alvos WHERE status='sent'),
         (SELECT COUNT(*) FROM alvos)
  UNION ALL
  SELECT 3, 'Fluxo iniciado', (SELECT COUNT(*) FROM fluxo_ok),
         (SELECT COUNT(*) FROM alvos)
  UNION ALL
  SELECT 4, 'Respondeu', (SELECT COUNT(*) FROM respostas),
         (SELECT COUNT(*) FROM alvos)
) t
ORDER BY ord;


-- ============================================================================
-- 4) QUEM RESPONDEU — lista para follow-up comercial
-- ============================================================================
WITH disparo AS (
  SELECT * FROM scheduled_messages
  WHERE id = '26904516-8e8e-42a4-a26d-4cc9d762b356'
),
alvos AS (
  SELECT smc.contact_id, smc.sent_at
  FROM scheduled_message_contacts smc, disparo d
  WHERE smc.scheduled_message_id = d.id AND smc.status = 'sent'
)
SELECT
  c.name                          AS contato,
  c.phone                         AS telefone,
  a.sent_at                       AS recebeu_em,
  MIN(m.created_at)               AS respondeu_em,
  date_trunc('minute', MIN(m.created_at) - a.sent_at) AS tempo_ate_responder,
  COUNT(m.id)                     AS qtd_mensagens_dela,
  (ARRAY_AGG(m.content ORDER BY m.created_at))[1] AS primeira_resposta
FROM alvos a
JOIN contacts c       ON c.id = a.contact_id
JOIN conversations conv ON conv.contact_id = a.contact_id
JOIN messages m       ON m.conversation_id = conv.id
                     AND m.direction = 'inbound'
                     AND m.created_at > a.sent_at
GROUP BY c.name, c.phone, a.sent_at
ORDER BY MIN(m.created_at) DESC;


-- ============================================================================
-- 5) RESPOSTAS POR HORA — quando as pessoas engajam
-- ============================================================================
WITH disparo AS (
  SELECT * FROM scheduled_messages
  WHERE id = '26904516-8e8e-42a4-a26d-4cc9d762b356'
),
alvos AS (
  SELECT smc.contact_id, smc.sent_at
  FROM scheduled_message_contacts smc, disparo d
  WHERE smc.scheduled_message_id = d.id AND smc.status = 'sent'
)
SELECT
  date_trunc('hour', m.created_at) AS hora,
  COUNT(DISTINCT a.contact_id)     AS pessoas_que_responderam
FROM alvos a
JOIN conversations conv ON conv.contact_id = a.contact_id
JOIN messages m ON m.conversation_id = conv.id
               AND m.direction = 'inbound'
               AND m.created_at > a.sent_at
GROUP BY 1
ORDER BY 1;


-- ============================================================================
-- 6) FALHAS — o que não saiu e por quê
-- ============================================================================
SELECT
  c.name  AS contato,
  c.phone AS telefone,
  smc.error_message AS motivo
FROM scheduled_message_contacts smc
JOIN contacts c ON c.id = smc.contact_id
WHERE smc.scheduled_message_id = '26904516-8e8e-42a4-a26d-4cc9d762b356'
  AND smc.status = 'failed';
