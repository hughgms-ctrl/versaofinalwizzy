-- =====================================================================
-- Fluxos pais presos esperando um sub-fluxo que já terminou
--
-- Contexto: a volta do sub-fluxo para o fluxo pai nunca funcionou. O
-- flow-execute mandava `resumeExecutionId` (chave que ele mesmo não lê) e
-- omitia `flowId`, então a chamada morria num 400 silencioso. O pai ficava
-- parado no nó "Disparar fluxo" até o timeout de 24h, ou até o contato
-- mandar outra mensagem por conta própria.
--
-- Com o conserto, quando um sub-fluxo terminar o pai volta a andar — e vai
-- mandar a mensagem que "deveria" ter saído. Rode as PARTES 1 e 2 ANTES de
-- subir, para saber quantas conversas isso alcança e cancelar as antigas.
--
-- Nota sobre o tamanho do risco: o conserto NÃO acorda execução parada
-- sozinha; ele só age quando um sub-fluxo termina daqui para frente. As
-- presas de dias atrás em geral já foram encerradas pelo timeout de 24h do
-- process-flow-timeouts. O que sobra é a janela curta — sub-fluxo rodando
-- agora, pai parado esperando. É essa que a PARTE 1 mostra.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 1 — Quem está parado num nó de sub-fluxo agora
--
-- `parado_ha` é o tempo desde que a execução do pai começou. Qualquer coisa
-- acima de algumas horas é passivo: quando o sub-fluxo dessa conversa
-- terminar, o pai vai retomar e falar com um contato que já esfriou.
-- ---------------------------------------------------------------------
SELECT
  fe.id                                        AS execucao_pai,
  fe.organization_id,
  f.name                                       AS fluxo_pai,
  no_atual.value ->> 'type'                    AS tipo_do_no,
  no_atual.value -> 'data' ->> 'label'         AS rotulo_do_no,
  no_atual.value -> 'data' ->> 'flowName'      AS subfluxo_chamado,
  c.phone                                      AS contato,
  fe.started_at,
  now() - fe.started_at                        AS parado_ha,
  fe.timeout_at,
  (SELECT count(*) FROM jsonb_object_keys(fe.variables)) AS qtd_variaveis
FROM flow_executions fe
JOIN flows f          ON f.id = fe.flow_id
JOIN conversations cv ON cv.id = fe.conversation_id
LEFT JOIN contacts c  ON c.id = cv.contact_id
CROSS JOIN LATERAL jsonb_array_elements(f.nodes) AS no_atual(value)
WHERE fe.status = 'waiting_input'
  AND no_atual.value ->> 'id' = fe.current_node_id
  AND no_atual.value ->> 'type' IN ('action-flow', 'orch-flow')
ORDER BY fe.started_at ASC;


-- ---------------------------------------------------------------------
-- PARTE 2 — Só a contagem, para decidir rápido
-- ---------------------------------------------------------------------
SELECT
  fe.organization_id,
  count(*) FILTER (WHERE now() - fe.started_at <  interval '2 hours')  AS recentes,
  count(*) FILTER (WHERE now() - fe.started_at >= interval '2 hours')  AS antigas,
  count(*)                                                             AS total
FROM flow_executions fe
JOIN flows f ON f.id = fe.flow_id
CROSS JOIN LATERAL jsonb_array_elements(f.nodes) AS no_atual(value)
WHERE fe.status = 'waiting_input'
  AND no_atual.value ->> 'id' = fe.current_node_id
  AND no_atual.value ->> 'type' IN ('action-flow', 'orch-flow')
GROUP BY fe.organization_id
ORDER BY total DESC;


-- ---------------------------------------------------------------------
-- PARTE 3 — Cancelar as antigas (RODE SÓ DEPOIS DE OLHAR A PARTE 1)
--
-- Encerra o pai sem disparar nada. O sub-fluxo dessa conversa continua vivo:
-- o que morre é só a espera do pai, que já não faz sentido.
--
-- Ajuste o corte de 2 horas para o que fizer sentido no seu caso, e prefira
-- rodar por organização (descomente o filtro) a rodar em tudo de uma vez.
-- ---------------------------------------------------------------------
-- BEGIN;
--
-- WITH presas AS (
--   SELECT fe.id
--   FROM flow_executions fe
--   JOIN flows f ON f.id = fe.flow_id
--   CROSS JOIN LATERAL jsonb_array_elements(f.nodes) AS no_atual(value)
--   WHERE fe.status = 'waiting_input'
--     AND no_atual.value ->> 'id' = fe.current_node_id
--     AND no_atual.value ->> 'type' IN ('action-flow', 'orch-flow')
--     AND now() - fe.started_at >= interval '2 hours'
--     -- AND fe.organization_id = 'COLE-O-ID-DA-ORG-AQUI'
-- )
-- UPDATE flow_executions fe
-- SET status        = 'completed',
--     completed_at  = now(),
--     timeout_at    = NULL,
--     error_message = 'cancelada: espera de sub-fluxo orfa (retomada do pai estava quebrada)'
-- FROM presas p
-- WHERE fe.id = p.id
-- RETURNING fe.id, fe.conversation_id, fe.flow_id;
--
-- -- Confira o RETURNING. Se bateu com a PARTE 1: COMMIT;  senão: ROLLBACK;
-- COMMIT;


-- ---------------------------------------------------------------------
-- PARTE 4 — Depois do deploy: a retomada está acontecendo?
--
-- Execuções nascidas de uma retomada de pai têm resumed_from_execution_id
-- apontando para a execução que ficou esperando.
-- ---------------------------------------------------------------------
SELECT
  filho.id            AS execucao_retomada,
  f.name              AS fluxo,
  filho.current_node_id,
  filho.started_at,
  pai.id              AS execucao_que_esperava,
  (SELECT count(*) FROM jsonb_object_keys(filho.variables)) AS variaveis_recebidas
FROM flow_executions filho
JOIN flow_executions pai ON pai.id = filho.resumed_from_execution_id
JOIN flows f             ON f.id = filho.flow_id
WHERE filho.started_at > now() - interval '1 day'
ORDER BY filho.started_at DESC
LIMIT 50;
