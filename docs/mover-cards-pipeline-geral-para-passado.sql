-- ============================================================================
-- Cards que ficaram nos DOIS pipelines depois de usar o no "movimentar para
-- pipeline" — diagnostico + conserto.
--
-- Causa (corrigida no codigo em supabase/functions/_shared/pipelineMove.ts):
-- o no gravava a posicao com UPSERT usando onConflict
-- 'conversation_id,pipeline_id'. Esse upsert nao move nada: ele cria uma linha
-- nova no pipeline de destino e deixa a linha antiga viva no pipeline de origem.
-- Resultado: o mesmo card aparece em "geral" E em "passado".
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
