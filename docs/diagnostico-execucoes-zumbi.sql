-- ============================================================================
-- Execuções presas em 'running' — diagnóstico, teste e conferência
--
-- 'running' significa "o motor está executando ISTO agora". O motor é o promise
-- de background do flow-execute, dentro de um isolate de edge function que vive
-- poucos minutos. Uma linha em 'running' há horas está morta.
--
-- Custo de deixar uma aberta: o zapi-webhook trata 'running' como fluxo ativo,
-- então a mensagem do contato não é resposta de fluxo nenhum E as campanhas não
-- são consultadas. A conversa daquele lead fica MUDA, sem erro em lugar nenhum.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. QUEM ESTÁ ZUMBI AGORA
--
-- Roda antes do deploy para ter o "antes", e depois para conferir que a rede de
-- proteção fechou. `conversa_muda` é a coluna que importa: diz se ESTA execução
-- é a que o webhook enxerga (started_at DESC entre as ativas) — ou seja, se o
-- lead já está sem resposta neste momento.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  fe.id,
  fe.status,
  fe.started_at,
  round(extract(epoch FROM (now() - fe.started_at)) / 3600, 1) AS horas_parada,
  f.name        AS fluxo,
  fe.current_node_id,
  c.phone       AS contato,
  fe.conversation_id,
  fe.id = (
    SELECT sub.id FROM public.flow_executions sub
    WHERE sub.conversation_id = fe.conversation_id
      AND sub.status IN ('running', 'waiting_input', 'waiting_delay')
    ORDER BY sub.started_at DESC
    LIMIT 1
  ) AS conversa_muda
FROM public.flow_executions fe
LEFT JOIN public.flows f          ON f.id  = fe.flow_id
LEFT JOIN public.conversations cv ON cv.id = fe.conversation_id
LEFT JOIN public.contacts c       ON c.id  = cv.contact_id
WHERE fe.status = 'running'
  AND fe.started_at < now() - interval '15 minutes'
ORDER BY fe.started_at ASC;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O CRON EXISTE MESMO?
--
-- A rede de proteção só roda se o process-flow-timeouts estiver agendado. Não há
-- migration de cron.schedule para ele no repo — se foi agendado à mão no banco,
-- aparece aqui. Se vier VAZIO, a rede de proteção nunca vai rodar.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE command ILIKE '%process-flow-timeouts%';

-- E as últimas rodadas do cron (falha silenciosa aparece aqui):
SELECT j.jobname, r.status, r.start_time, left(coalesce(r.return_message, ''), 200) AS msg
FROM cron.job_run_details r
JOIN cron.job j ON j.jobid = r.jobid
WHERE j.command ILIKE '%process-flow-timeouts%'
ORDER BY r.start_time DESC
LIMIT 10;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TESTE DA CORREÇÃO — reproduzir a retomada sem esperar lead real
--
-- ATENÇÃO: o fluxo retomado ENVIA MENSAGEM DE VERDADE pelo WhatsApp. Escolha
-- uma conversa cujo contato seja um número SEU.
--
-- 3A. Achar um alvo: conversa + nó de bloco de conteúdo que espera resposta e
--     tem saída ligada (é exatamente o caminho que o webhook percorre).
-- ─────────────────────────────────────────────────────────────────────────────
WITH nos AS (
  SELECT
    f.id AS flow_id, f.name AS fluxo, f.organization_id,
    n->>'id'     AS node_id,
    e->>'target' AS proximo_no
  FROM public.flows f
  CROSS JOIN LATERAL jsonb_array_elements(f.nodes) n
  JOIN LATERAL jsonb_array_elements(f.edges) e
    ON e->>'source' = n->>'id'
  WHERE n->>'type' = 'content-block'
    AND (n->'data'->>'waitForResponse')::boolean IS TRUE
)
SELECT nos.*, cv.id AS conversation_id, ct.phone,
       wi.evolution_instance_name, wi.zapi_instance_id
FROM nos
JOIN public.conversations cv ON cv.organization_id = nos.organization_id
JOIN public.contacts ct      ON ct.id = cv.contact_id
LEFT JOIN public.whatsapp_instances wi ON wi.id = cv.instance_id
WHERE ct.phone = '55SEUNUMEROAQUI'   -- <<< troque pelo SEU número (só dígitos)
LIMIT 5;


-- 3B. Semear a execução no estado que o webhook espera encontrar.
--     Guarde o id devolvido — é o "id_semeado" das conferências abaixo.
INSERT INTO public.flow_executions
  (flow_id, conversation_id, organization_id, status, current_node_id, variables)
VALUES
  ('<flow_id do 3A>', '<conversation_id do 3A>', '<organization_id do 3A>',
   'waiting_input', '<node_id do 3A>', '{"teste_zumbi": "antes"}'::jsonb)
RETURNING id, root_execution_id, started_at;


-- 3C. Disparar o webhook. Isto roda no SEU terminal, não no SQL Editor.
--     Sem header de token: a validação só rejeita se o header VIER e não bater.
--     (O bloco abaixo é PowerShell; o "> " no começo é só marca de comentário.)
--
--  > $body = '{"event":"messages.upsert",
--  >   "instance":"<evolution_instance_name ou zapi_instance_id do 3A>",
--  >   "data":{"key":{"remoteJid":"55SEUNUMEROAQUI@s.whatsapp.net",
--  >                  "fromMe":false,"id":"TESTE-ZUMBI-001"},
--  >           "pushName":"Teste Zumbi",
--  >           "message":{"conversation":"resposta de teste"}}}'
--  >
--  > Invoke-RestMethod -Method Post -ContentType "application/json" -Body $body
--  >   -Uri "https://<PROJECT-REF>.supabase.co/functions/v1/zapi-webhook"


-- 3D. CONFERÊNCIA. Rode ~15 segundos depois do 3C.
--
-- ESPERADO DEPOIS DA CORREÇÃO — duas linhas:
--   • a semeada: status 'completed', completed_at preenchido;
--   • uma nova:  resumed_from_execution_id = id_semeado,
--                root_execution_id igual nas duas (mesma passagem no histórico),
--                status 'completed' ou 'waiting_input' (depende do próximo nó).
--   • NENHUMA linha em 'running'.
--
-- ANTES DA CORREÇÃO era: a semeada em 'running' para sempre,
--   resumed_from_execution_id NULL na nova, e raízes diferentes.
SELECT id, status, current_node_id, started_at, completed_at,
       resumed_from_execution_id, root_execution_id, variables
FROM public.flow_executions
WHERE conversation_id = '<conversation_id do 3A>'
ORDER BY started_at DESC
LIMIT 5;


-- 3E. Limpeza do teste.
DELETE FROM public.flow_executions
WHERE conversation_id = '<conversation_id do 3A>'
  AND variables->>'teste_zumbi' IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TESTE DA REDE DE PROTEÇÃO (item 2), isolado da causa
--
-- Semeia uma zumbi já velha e chama o cron na mão. Não envia mensagem nenhuma:
-- a rede de proteção só fecha a linha.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.flow_executions
  (flow_id, conversation_id, organization_id, status, current_node_id, started_at, variables)
VALUES
  ('<qualquer flow_id>', '<qualquer conversation_id>', '<organization_id>',
   'running', 'no-que-nao-existe', now() - interval '2 hours',
   '{"teste_zumbi": "rede"}'::jsonb)
RETURNING id;

--  > Invoke-RestMethod -Method Post
--  >   -Uri "https://<PROJECT-REF>.supabase.co/functions/v1/process-flow-timeouts"
--  >   -Headers @{ Authorization = "Bearer <SERVICE_ROLE_KEY>" }
--
--    A resposta traz "zombiesClosed": 1.

-- Esperado: status 'failed', completed_at preenchido, error_message explicando.
SELECT id, status, completed_at, error_message
FROM public.flow_executions
WHERE variables->>'teste_zumbi' = 'rede';

DELETE FROM public.flow_executions WHERE variables->>'teste_zumbi' = 'rede';
