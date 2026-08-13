-- ============================================================================
-- RELATÓRIO DE DISPARO — QUERY ÚNICA (saída empilhada, pronta para colar)
-- ============================================================================
-- Devolve TUDO em um resultado só, no formato:
--   secao | ordem | metrica | valor | detalhe
-- Basta copiar o resultado inteiro e entregar para montar o PDF.
--
-- COMO LER:
--  - "Entregue" = o disparo iniciou o fluxo para a pessoa. NÃO é confirmação
--    de leitura nem de entrega no aparelho.
--  - "Respondeu" = houve mensagem inbound do contato DEPOIS do envio para ele.
--  - Números são PARCIAIS enquanto houver gente em "ainda na fila".
-- ============================================================================

WITH disparo AS (
  SELECT * FROM scheduled_messages
  WHERE id = '26904516-8e8e-42a4-a26d-4cc9d762b356'
),
alvos AS (
  SELECT smc.contact_id, smc.status, smc.sent_at, smc.error_message
  FROM scheduled_message_contacts smc, disparo d
  WHERE smc.scheduled_message_id = d.id
),
enviados AS (
  SELECT * FROM alvos WHERE status = 'sent'
),
respostas AS (
  SELECT
    e.contact_id,
    MIN(m.created_at)  AS respondeu_em,
    MIN(e.sent_at)     AS recebeu_em,
    COUNT(m.id)        AS qtd_msgs
  FROM enviados e
  JOIN conversations conv ON conv.contact_id = e.contact_id
  JOIN messages m ON m.conversation_id = conv.id
                 AND m.direction = 'inbound'
                 AND m.created_at > e.sent_at
  GROUP BY e.contact_id
),
nos AS (
  SELECT
    n->>'id'   AS node_id,
    COALESCE(n->'data'->>'label', n->'data'->>'title', n->>'type') AS node_label,
    n->>'type' AS node_type
  FROM disparo d
  JOIN flows f ON f.id = d.flow_id
  CROSS JOIN LATERAL jsonb_array_elements(f.nodes::jsonb) AS n
),
exec AS (
  SELECT DISTINCT ON (conv.contact_id)
    conv.contact_id, fe.status AS exec_status, fe.current_node_id
  FROM enviados e
  JOIN conversations conv ON conv.contact_id = e.contact_id
  JOIN flow_executions fe ON fe.conversation_id = conv.id
  JOIN disparo d ON d.flow_id = fe.flow_id
  ORDER BY conv.contact_id, fe.started_at DESC
)

-- ---------------------------------------------------------------- 1. RESUMO
SELECT '1. RESUMO' AS secao, 1 AS ordem, 'Nome do disparo' AS metrica,
       d.name AS valor, NULL AS detalhe
FROM disparo d
UNION ALL SELECT '1. RESUMO', 2, 'Status do disparo', d.status, NULL FROM disparo d
UNION ALL SELECT '1. RESUMO', 3, 'Total na lista', (SELECT COUNT(*)::text FROM alvos), NULL
UNION ALL SELECT '1. RESUMO', 4, 'Mensagens enviadas', (SELECT COUNT(*)::text FROM enviados), NULL
UNION ALL SELECT '1. RESUMO', 5, 'Falhas', (SELECT COUNT(*)::text FROM alvos WHERE status='failed'), NULL
UNION ALL SELECT '1. RESUMO', 6, 'Ainda na fila', (SELECT COUNT(*)::text FROM alvos WHERE status='pending'), NULL
UNION ALL SELECT '1. RESUMO', 7, 'Responderam', (SELECT COUNT(*)::text FROM respostas), NULL
UNION ALL SELECT '1. RESUMO', 8, 'Taxa de resposta (%)',
  COALESCE((SELECT ROUND(100.0*(SELECT COUNT(*) FROM respostas)
            / NULLIF((SELECT COUNT(*) FROM enviados),0), 1)::text), '0'),
  'sobre as mensagens enviadas'
UNION ALL SELECT '1. RESUMO', 9, 'Primeiro envio',
  (SELECT MIN(sent_at)::text FROM enviados), NULL
UNION ALL SELECT '1. RESUMO', 10, 'Último envio',
  (SELECT MAX(sent_at)::text FROM enviados), NULL

-- ------------------------------------------------------------------ 2. FUNIL
UNION ALL SELECT '2. FUNIL', 1, 'Na lista', (SELECT COUNT(*)::text FROM alvos), '100%'
UNION ALL SELECT '2. FUNIL', 2, 'Mensagem enviada', (SELECT COUNT(*)::text FROM enviados),
  (SELECT ROUND(100.0*COUNT(*)/NULLIF((SELECT COUNT(*) FROM alvos),0),1)::text || '%' FROM enviados)
UNION ALL SELECT '2. FUNIL', 3, 'Fluxo iniciado', (SELECT COUNT(*)::text FROM exec),
  (SELECT ROUND(100.0*COUNT(*)/NULLIF((SELECT COUNT(*) FROM alvos),0),1)::text || '%' FROM exec)
UNION ALL SELECT '2. FUNIL', 4, 'Respondeu', (SELECT COUNT(*)::text FROM respostas),
  (SELECT ROUND(100.0*COUNT(*)/NULLIF((SELECT COUNT(*) FROM alvos),0),1)::text || '%' FROM respostas)

-- --------------------------------------------------------------- 3. ESTÁGIOS
UNION ALL
SELECT '3. ESTAGIOS DO FLUXO', 100 + ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC),
       COALESCE(nos.node_label, '(sem no / nao iniciado)'),
       COUNT(*)::text,
       'tipo: ' || COALESCE(nos.node_type,'?') || ' | execucao: ' || COALESCE(e.exec_status,'?')
FROM exec e
LEFT JOIN nos ON nos.node_id = e.current_node_id
GROUP BY nos.node_label, nos.node_type, e.exec_status

-- -------------------------------------------------------- 4. QUEM RESPONDEU
UNION ALL
SELECT '4. QUEM RESPONDEU', 200 + ROW_NUMBER() OVER (ORDER BY r.respondeu_em DESC),
       c.name,
       c.phone,
       'respondeu em ' || r.respondeu_em::text
         || ' | levou ' || date_trunc('minute', r.respondeu_em - r.recebeu_em)::text
         || ' | ' || r.qtd_msgs::text || ' msg(s)'
FROM respostas r
JOIN contacts c ON c.id = r.contact_id

-- --------------------------------------------------- 5. RESPOSTAS POR HORA
UNION ALL
SELECT '5. RESPOSTAS POR HORA', 300 + ROW_NUMBER() OVER (ORDER BY date_trunc('hour', r.respondeu_em)),
       date_trunc('hour', r.respondeu_em)::text,
       COUNT(*)::text,
       'pessoas que responderam nesta hora'
FROM respostas r
GROUP BY date_trunc('hour', r.respondeu_em)

-- ---------------------------------------------------------------- 6. FALHAS
UNION ALL
SELECT '6. FALHAS', 400 + ROW_NUMBER() OVER (ORDER BY c.name),
       c.name, c.phone, a.error_message
FROM alvos a
JOIN contacts c ON c.id = a.contact_id
WHERE a.status = 'failed'

ORDER BY secao, ordem;
