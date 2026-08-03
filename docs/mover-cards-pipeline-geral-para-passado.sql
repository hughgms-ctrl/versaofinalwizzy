-- ============================================================================
-- Cards que aparecem em "Pipeline Geral" E em "eventos passados" depois de usar
-- o no "movimentar para pipeline" — diagnostico + conserto.
--
-- >>> DIAGNOSTICO CONCLUIDO EM 2026-07-30. LEIA ANTES DE RODAR QUALQUER COISA:
--
--   O no NAO duplicou. As PARTES 0 a 6 abaixo foram escritas para a hipotese de
--   posicao duplicada (mesma conversa em dois pipelines) e ela foi DESCARTADA:
--   a query da PARTE 1 voltou 0. Elas ficam aqui como diagnostico reutilizavel,
--   nao como plano de acao.
--
--   O que realmente existe sao 28 contatos com DUAS conversas cada:
--     - a boa: instancia "Sucesso do cliente" (connected), historico real,
--       card em "eventos passados" — foi essa que o no moveu, corretamente;
--     - a orfa: whatsapp_instance_id NULL, criada na rajada de 08/07 entre
--       16h e 17h30, com 1 mensagem outbound (entregue/lida) do disparo
--       "Ola, {NOME}, vai tudo bem com voce?". O card dela entrou no board em
--       28/07 14:54:13 (todos no mesmo segundo, insercao em lote) e nunca saiu
--       do "Pipeline Geral".
--
--   As 27 mensagens das orfas (a do Fagner tem 0) NAO existem na conversa boa —
--   conferido comparando content. Por isso o conserto e UNIFICAR (PARTE 7), e
--   nao apagar: apagar perderia o registro de um disparo que foi entregue.
--
--   O bug do upsert citado abaixo e real e foi corrigido em
--   supabase/functions/_shared/pipelineMove.ts, mas nao e a causa deste caso —
--   o fluxo passou pelo flow-execute, que ja movia certo.
--
-- Rodar no SQL Editor do Supabase, UMA PARTE POR VEZ. As PARTES 0 a 2 sao so
-- leitura. Nada muda no banco ate a PARTE 3.
-- ============================================================================


-- ============================================================================
-- PARTE 0 — Os dois pipelines e a restricao de unicidade
-- ============================================================================

-- 0.1 — Confirme os ids/nomes dos pipelines (ajuste os ILIKE se preciso):
SELECT id, name, organization_id, created_at
FROM public.pipelines
WHERE name ILIKE '%geral%' OR name ILIKE '%passado%'
ORDER BY name;

-- 0.2 — A migration 20260309020135 criou UNIQUE(conversation_id) — "uma conversa
--       so pode estar em um pipeline". Se ela ESTIVER no banco, o upsert antigo
--       teria falhado e o card nem apareceria no destino; se NAO estiver, a
--       duplicacao acontece silenciosamente. Descubra qual e o caso:
SELECT conname, pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conrelid = 'public.conversation_pipeline_positions'::regclass
  AND contype IN ('u', 'p');
-- Esperado se a regra estiver ativa: uma linha com UNIQUE (conversation_id).


-- ============================================================================
-- PARTE 1 — Quantas conversas estao em mais de um pipeline ao mesmo tempo
-- ============================================================================
SELECT
  COUNT(*) AS conversas_em_2_ou_mais_pipelines,
  SUM(qtd) AS total_de_linhas_dessas_conversas
FROM (
  SELECT conversation_id, COUNT(*) AS qtd
  FROM public.conversation_pipeline_positions
  GROUP BY conversation_id
  HAVING COUNT(*) > 1
) d;

-- 1.2 — Detalhe: quem esta duplicado, em quais pipelines, e qual linha e a mais
--       recente (a mais recente e a que representa o movimento que voce fez).
SELECT
  c.id            AS conversation_id,
  ct.name         AS contato,
  ct.phone,
  p.name          AS pipeline,
  col.name        AS coluna,
  pos.updated_at,
  ROW_NUMBER() OVER (PARTITION BY pos.conversation_id ORDER BY pos.updated_at DESC) AS recencia
FROM public.conversation_pipeline_positions pos
JOIN public.conversations c   ON c.id = pos.conversation_id
JOIN public.contacts ct       ON ct.id = c.contact_id
JOIN public.pipelines p       ON p.id = pos.pipeline_id
JOIN public.pipeline_columns col ON col.id = pos.column_id
WHERE pos.conversation_id IN (
  SELECT conversation_id
  FROM public.conversation_pipeline_positions
  GROUP BY conversation_id
  HAVING COUNT(*) > 1
)
ORDER BY ct.name NULLS LAST, pos.updated_at DESC;


-- ============================================================================
-- PARTE 2 — Cenario alternativo: nao e duplicacao de POSICAO, e duplicacao de
--           CONVERSA. O card mostra o nome do contato; se o contato tem duas
--           conversas (numeros/instancias diferentes), aparecem dois cards
--           diferentes, um em cada pipeline. O conserto e outro (unificar
--           conversas — ver docs/unificar-conversas-duplicadas.sql).
-- ============================================================================
WITH pos AS (
  SELECT p.conversation_id, pl.name AS pipeline, c.contact_id, c.organization_id
  FROM public.conversation_pipeline_positions p
  JOIN public.pipelines pl    ON pl.id = p.pipeline_id
  JOIN public.conversations c ON c.id = p.conversation_id
)
SELECT
  ct.name  AS contato,
  ct.phone,
  COUNT(DISTINCT pos.conversation_id) AS conversas_com_card,
  STRING_AGG(DISTINCT pos.pipeline, ' | ') AS pipelines
FROM pos
JOIN public.contacts ct ON ct.id = pos.contact_id
GROUP BY ct.name, ct.phone
HAVING COUNT(DISTINCT pos.conversation_id) > 1
ORDER BY conversas_com_card DESC;


-- ============================================================================
-- PARTE 3 — CONSERTO A: apagar a linha antiga, mantendo a mais recente
--           (use quando a PARTE 1 mostrou conversas com mais de uma linha).
--           Isso e exatamente o que o "mover" deveria ter feito.
--
--           PREVIEW primeiro — confira que so aparecem as linhas ANTIGAS:
-- ============================================================================
WITH ranked AS (
  SELECT
    pos.id,
    pos.conversation_id,
    p.name  AS pipeline,
    pos.updated_at,
    ROW_NUMBER() OVER (PARTITION BY pos.conversation_id ORDER BY pos.updated_at DESC) AS rn
  FROM public.conversation_pipeline_positions pos
  JOIN public.pipelines p ON p.id = pos.pipeline_id
)
SELECT r.id, ct.name AS contato, r.pipeline AS sera_apagada_desta, r.updated_at
FROM ranked r
JOIN public.conversations c ON c.id = r.conversation_id
JOIN public.contacts ct     ON ct.id = c.contact_id
WHERE r.rn > 1
ORDER BY ct.name NULLS LAST;

-- 3.2 — Aplicar (so depois de conferir a 3.1):
-- DELETE FROM public.conversation_pipeline_positions pos
-- USING (
--   SELECT id, ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY updated_at DESC) AS rn
--   FROM public.conversation_pipeline_positions
-- ) r
-- WHERE r.id = pos.id AND r.rn > 1;


-- ============================================================================
-- PARTE 4 — CONSERTO B: mover de verdade os cards que ainda estao so em "geral"
--           e deveriam estar em "passado". Faz UPDATE (nao cria linha nova).
--
--           Preencha os dois ids com o resultado da 0.1 e escolha a coluna de
--           destino. Sem WHERE extra isso move TODOS os cards do "geral" —
--           quase certamente voce quer restringir (exemplo comentado abaixo).
-- ============================================================================

-- 4.1 — Colunas do pipeline de destino, para escolher o column_id:
SELECT c.id, c.name, c."order"
FROM public.pipeline_columns c
JOIN public.pipelines p ON p.id = c.pipeline_id
WHERE p.name ILIKE '%passado%'
ORDER BY c."order";

-- 4.2 — PREVIEW: quem seria movido. Ajuste o filtro da lista de contatos.
WITH destino AS (
  SELECT id FROM public.pipelines WHERE name ILIKE '%passado%' LIMIT 1
), origem AS (
  SELECT id FROM public.pipelines WHERE name ILIKE '%geral%' LIMIT 1
)
SELECT ct.name AS contato, ct.phone, col.name AS coluna_atual, pos.updated_at
FROM public.conversation_pipeline_positions pos
JOIN public.conversations c      ON c.id = pos.conversation_id
JOIN public.contacts ct          ON ct.id = c.contact_id
JOIN public.pipeline_columns col ON col.id = pos.column_id
WHERE pos.pipeline_id = (SELECT id FROM origem)
  -- AND ct.phone IN ('5511999999999', '5511888888888')   -- <<< restrinja aqui
ORDER BY ct.name NULLS LAST;

-- 4.3 — Aplicar o movimento (descomente e coloque o column_id da 4.1):
-- UPDATE public.conversation_pipeline_positions pos
-- SET pipeline_id = (SELECT id FROM public.pipelines WHERE name ILIKE '%passado%' LIMIT 1),
--     column_id   = 'COLE_AQUI_O_COLUMN_ID'::uuid,
--     "order"     = 0,
--     updated_at  = now()
-- FROM public.conversations c, public.contacts ct
-- WHERE c.id = pos.conversation_id
--   AND ct.id = c.contact_id
--   AND pos.pipeline_id = (SELECT id FROM public.pipelines WHERE name ILIKE '%geral%' LIMIT 1)
--   AND ct.phone IN ('5511999999999');   -- <<< o mesmo filtro da 4.2


-- ============================================================================
-- PARTE 5 — VERIFICACAO
-- ============================================================================
SELECT p.name AS pipeline, COUNT(*) AS cards
FROM public.conversation_pipeline_positions pos
JOIN public.pipelines p ON p.id = pos.pipeline_id
GROUP BY p.name
ORDER BY cards DESC;

-- 5.2 — Nao pode voltar nenhuma linha:
SELECT conversation_id, COUNT(*)
FROM public.conversation_pipeline_positions
GROUP BY conversation_id
HAVING COUNT(*) > 1;


-- ============================================================================
-- PARTE 6 — OPCIONAL: reforcar a regra no banco, para nenhum codigo futuro
--           conseguir duplicar de novo. So rode se a 0.2 mostrou que a
--           constraint NAO existe, e depois da PARTE 3 (senao falha).
-- ============================================================================
-- ALTER TABLE public.conversation_pipeline_positions
-- ADD CONSTRAINT unique_conversation_pipeline_position UNIQUE (conversation_id);


-- ############################################################################
-- PARTE 7 — O CONSERTO DE VERDADE DESTE CASO: unificar as 28 orfas
--
-- Move a mensagem de 08/07 da conversa orfa para a conversa boa e tira o card
-- da orfa do board. A conversa orfa em si continua existindo (vazia) — apagar
-- ela e a PARTE 8, opcional e separada.
--
-- Rode os PASSOS na ordem. O 1 e o 2 sao leitura/backup; nada muda ate o 3.
-- ############################################################################

-- 7.1 — PASSO 1: tabela de mapeamento orfa -> boa. E o backup que permite
--       desfazer tudo. NAO apague ela ate ter certeza do resultado.
CREATE TABLE public._merge_orfas_20260730 AS
WITH orfa AS (
  SELECT
    pos.id          AS position_id,
    pos.pipeline_id,
    pos.column_id,
    pos."order",
    conv.id         AS orfa_id,
    conv.contact_id
  FROM public.conversation_pipeline_positions pos
  JOIN public.conversations conv ON conv.id = pos.conversation_id
  JOIN public.pipelines p        ON p.id = pos.pipeline_id
  WHERE p.name = 'Pipeline Geral'
    AND conv.whatsapp_instance_id IS NULL
)
SELECT o.*, b.boa_id
FROM orfa o
JOIN LATERAL (
  -- a conversa boa: mesma pessoa, outra conversa, com card em eventos passados
  SELECT conv2.id AS boa_id
  FROM public.conversation_pipeline_positions pos2
  JOIN public.conversations conv2 ON conv2.id = pos2.conversation_id
  JOIN public.pipelines p2        ON p2.id = pos2.pipeline_id
  WHERE conv2.contact_id = o.contact_id
    AND conv2.id <> o.orfa_id
    AND p2.name = 'eventos passados'
  ORDER BY conv2.created_at
  LIMIT 1
) b ON true;

-- 7.2 — PASSO 2: sanidade. As tres colunas tem que dar 28, 28, 28.
--       Se boas_distintas < total, duas orfas apontam para a mesma conversa boa
--       — PARE e investigue antes de seguir.
SELECT
  COUNT(*)                    AS total,
  COUNT(DISTINCT orfa_id)     AS orfas_distintas,
  COUNT(DISTINCT boa_id)      AS boas_distintas
FROM public._merge_orfas_20260730;

-- 7.3 — PASSO 2b: backup das mensagens que serao movidas (permite desfazer o
--       PASSO 3 sozinho). Esperado: 27 linhas (a orfa do Fagner tem 0).
CREATE TABLE public._merge_orfas_msgs_20260730 AS
SELECT m.id AS message_id, m.conversation_id AS conversation_id_original
FROM public.messages m
WHERE m.conversation_id IN (SELECT orfa_id FROM public._merge_orfas_20260730);

SELECT COUNT(*) AS mensagens_a_mover FROM public._merge_orfas_msgs_20260730;

-- 7.4 — PASSO 3: mover as mensagens para a conversa boa.
UPDATE public.messages m
SET conversation_id = mp.boa_id
FROM public._merge_orfas_20260730 mp
WHERE m.conversation_id = mp.orfa_id;

-- 7.5 — PASSO 4: recalcular last_message_at/direction das conversas boas.
--       Importa principalmente para as 9 que estavam com 0 mensagens.
UPDATE public.conversations c
SET last_message_at        = sub.max_at,
    last_message_direction = sub.dir
FROM (
  SELECT
    m.conversation_id,
    MAX(m.created_at) AS max_at,
    (SELECT m2.direction::text
       FROM public.messages m2
      WHERE m2.conversation_id = m.conversation_id
      ORDER BY m2.created_at DESC
      LIMIT 1) AS dir
  FROM public.messages m
  WHERE m.conversation_id IN (SELECT boa_id FROM public._merge_orfas_20260730)
  GROUP BY m.conversation_id
) sub
WHERE c.id = sub.conversation_id
  AND c.last_message_at IS DISTINCT FROM sub.max_at;

-- 7.6 — PASSO 5: tirar o card da orfa do board (a conversa continua existindo).
DELETE FROM public.conversation_pipeline_positions
WHERE id IN (SELECT position_id FROM public._merge_orfas_20260730);

-- 7.7 — PASSO 6: verificacao.
--       a) Pipeline Geral cai de 62 para 34; eventos passados segue com 46.
SELECT p.name, COUNT(*) AS cards
FROM public.conversation_pipeline_positions pos
JOIN public.pipelines p ON p.id = pos.pipeline_id
WHERE p.name IN ('Pipeline Geral', 'eventos passados')
GROUP BY p.name;

--       b) Nenhum contato com dois cards. Tem que voltar vazio.
WITH pos AS (
  SELECT p.conversation_id, c.contact_id
  FROM public.conversation_pipeline_positions p
  JOIN public.conversations c ON c.id = p.conversation_id
)
SELECT contact_id, COUNT(DISTINCT conversation_id)
FROM pos GROUP BY contact_id HAVING COUNT(DISTINCT conversation_id) > 1;

--       c) As orfas ficaram vazias e as boas receberam a mensagem:
SELECT
  (SELECT COUNT(*) FROM public.messages
    WHERE conversation_id IN (SELECT orfa_id FROM public._merge_orfas_20260730)) AS msgs_ainda_nas_orfas,
  (SELECT COUNT(*) FROM public.messages
    WHERE conversation_id IN (SELECT boa_id FROM public._merge_orfas_20260730)) AS msgs_nas_boas;
-- msgs_ainda_nas_orfas tem que ser 0.

-- 7.8 — ROLLBACK (se algo saiu errado, na ordem inversa):
-- UPDATE public.messages m
-- SET conversation_id = b.conversation_id_original
-- FROM public._merge_orfas_msgs_20260730 b
-- WHERE m.id = b.message_id;
--
-- INSERT INTO public.conversation_pipeline_positions (id, conversation_id, pipeline_id, column_id, "order")
-- SELECT position_id, orfa_id, pipeline_id, column_id, "order"
-- FROM public._merge_orfas_20260730;

-- 7.9 — LIMPEZA (so depois de conferir tudo, e da PARTE 8 se for fazer):
-- DROP TABLE public._merge_orfas_20260730;
-- DROP TABLE public._merge_orfas_msgs_20260730;


-- ############################################################################
-- PARTE 8 — OPCIONAL, DEPOIS: apagar as 28 conversas orfas ja vazias.
--
-- Elas somem do board na PARTE 7, mas continuam na lista de conversas, sem
-- numero e sem mensagem. Apagar exige checar as FKs que NAO sao cascade.
-- ############################################################################

-- 8.1 — Quais tabelas apontam para conversations sem ON DELETE CASCADE/SET NULL
--       (essas bloqueiam o DELETE). confdeltype: a=NO ACTION, r=RESTRICT.
SELECT c.conname, c.conrelid::regclass AS tabela, a.attname AS coluna
FROM pg_constraint c
JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
WHERE c.confrelid = 'public.conversations'::regclass
  AND c.contype = 'f'
  AND c.confdeltype IN ('a', 'r');

-- 8.2 — RESULTADO DA 8.1 EM 2026-07-30: so duas tabelas bloqueiam —
--       generated_documents e document_signatures (as mesmas que o app limpa
--       antes de excluir uma conversa, ver ConversationActionsMenu.tsx).
--       Depende da tabela criada em 7.1, entao rode a PARTE 7 antes.
SELECT 'generated_documents' AS tabela, COUNT(*) AS linhas_apontando_para_orfa
FROM public.generated_documents
WHERE conversation_id IN (SELECT orfa_id FROM public._merge_orfas_20260730)
UNION ALL
SELECT 'document_signatures', COUNT(*)
FROM public.document_signatures
WHERE conversation_id IN (SELECT orfa_id FROM public._merge_orfas_20260730);

-- 8.2b — Se alguma das duas voltar > 0: NAO apague nem zere a referencia.
--        Reaponte para a conversa boa — o documento continua ligado ao mesmo
--        atendimento, agora na conversa que sobreviveu.
-- UPDATE public.generated_documents g
-- SET conversation_id = mp.boa_id
-- FROM public._merge_orfas_20260730 mp
-- WHERE g.conversation_id = mp.orfa_id;
--
-- UPDATE public.document_signatures d
-- SET conversation_id = mp.boa_id
-- FROM public._merge_orfas_20260730 mp
-- WHERE d.conversation_id = mp.orfa_id;

-- 8.3 — Com as duas em 0 (ou reapontadas), pode apagar. O resto das FKs e
--       cascade/set null, entao o card, o historico de etapa, os logs de fluxo
--       e afins somem junto — e as mensagens ja saira na PARTE 7.
-- DELETE FROM public.conversations
-- WHERE id IN (SELECT orfa_id FROM public._merge_orfas_20260730);

-- 8.4 — Verificacao final: tem que voltar 0.
-- SELECT COUNT(*) FROM public.conversations
-- WHERE id IN (SELECT orfa_id FROM public._merge_orfas_20260730);
