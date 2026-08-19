-- ============================================================================
-- Diagnóstico: tags automáticas por coluna (pipeline_columns.auto_add_tag_ids)
-- ============================================================================
-- Rodar no SQL Editor do Supabase DEPOIS que a migration
-- 20260819150000_fix_column_auto_tags_trigger.sql tiver subido.
--
-- Contexto: o campo tinha consumidor (trigger trg_apply_column_auto_tags), mas
-- a função inseria added_by_type = 'system', valor que a CHECK de contact_tags
-- não aceita. Como o trigger é AFTER na tabela de posições, isso derrubava a
-- transação: mover card para coluna com tag automática falhava por inteiro.
--
-- As partes 1 a 3 só leem. A parte 4 escreve e está comentada.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- PARTE 1 — o trigger existe e a função está com o valor certo?
-- ---------------------------------------------------------------------------
-- Esperado: 1 linha, enabled = 'O' (habilitado).
SELECT
  t.tgname          AS trigger_name,
  c.relname         AS tabela,
  t.tgenabled       AS enabled,
  p.proname         AS funcao
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc  p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND c.relname = 'conversation_pipeline_positions'
  AND t.tgname  = 'trg_apply_column_auto_tags';

-- Esperado: grava_flow = true, grava_system = false.
SELECT
  position('''flow''' IN prosrc)   > 0 AS grava_flow,
  position('''system''' IN prosrc) > 0 AS grava_system
FROM pg_proc
WHERE proname = 'apply_column_auto_tags';

-- Valores aceitos hoje em contact_tags.added_by_type.
-- Confira que 'flow' está na lista.
SELECT pg_get_constraintdef(oid) AS check_atual
FROM pg_constraint
WHERE conname = 'contact_tags_added_by_type_check';


-- ---------------------------------------------------------------------------
-- PARTE 2 — quais colunas prometem tag automática?
-- ---------------------------------------------------------------------------
-- Se vier vazio, ninguém configurou o recurso ainda e não há o que consertar
-- em dado — basta a migration.
SELECT
  pl.organization_id,
  pl.name                  AS funil,
  pc.name                  AS coluna,
  pc.id                    AS column_id,
  array_length(pc.auto_add_tag_ids, 1) AS qtd_tags,
  (SELECT array_agg(t.name ORDER BY t.name)
     FROM public.tags t
    WHERE t.id = ANY(pc.auto_add_tag_ids)) AS tags_existentes,
  -- Ids no array que não existem mais em tags. A função nova ignora esses;
  -- a antiga estourava a FK por causa deles.
  (SELECT array_agg(x)
     FROM unnest(pc.auto_add_tag_ids) AS x
    WHERE NOT EXISTS (SELECT 1 FROM public.tags t WHERE t.id = x)) AS tags_orfas
FROM public.pipeline_columns pc
JOIN public.pipelines pl ON pl.id = pc.pipeline_id
WHERE array_length(pc.auto_add_tag_ids, 1) IS NOT NULL
ORDER BY pl.organization_id, pl.name, pc."order";


-- ---------------------------------------------------------------------------
-- PARTE 3 — o passivo: cards já parados na coluna, sem a tag que deviam ter
-- ---------------------------------------------------------------------------
-- Esses são os contatos que o trigger deixou passar enquanto estava quebrado.
-- Confira o volume aqui ANTES de rodar a parte 4.
SELECT
  pl.name    AS funil,
  pc.name    AS coluna,
  tg.name    AS tag_faltando,
  count(*)   AS contatos
FROM public.conversation_pipeline_positions cpp
JOIN public.pipeline_columns pc ON pc.id = cpp.column_id
JOIN public.pipelines       pl ON pl.id = pc.pipeline_id
JOIN public.conversations    c ON c.id  = cpp.conversation_id
JOIN public.tags            tg ON tg.id = ANY(pc.auto_add_tag_ids)
WHERE c.contact_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.contact_tags ct
     WHERE ct.contact_id = c.contact_id
       AND ct.tag_id     = tg.id
  )
GROUP BY pl.name, pc.name, tg.name
ORDER BY contatos DESC;


-- ---------------------------------------------------------------------------
-- PARTE 4 — backfill (ESCREVE). Descomente só depois de conferir a parte 3.
-- ---------------------------------------------------------------------------
-- Aplica, nos cards que já estão parados nessas colunas, a tag que o trigger
-- deveria ter aplicado na entrada. Fora da migration de propósito: aplicar tag
-- em massa é decisão de negócio, não efeito colateral de deploy.
--
-- Restringir a uma organização: descomente também a linha do organization_id.
--
-- INSERT INTO public.contact_tags (contact_id, tag_id, added_by_type)
-- SELECT DISTINCT c.contact_id, tg.id, 'flow'
-- FROM public.conversation_pipeline_positions cpp
-- JOIN public.pipeline_columns pc ON pc.id = cpp.column_id
-- JOIN public.pipelines       pl ON pl.id = pc.pipeline_id
-- JOIN public.conversations    c ON c.id  = cpp.conversation_id
-- JOIN public.tags            tg ON tg.id = ANY(pc.auto_add_tag_ids)
-- WHERE c.contact_id IS NOT NULL
-- --  AND pl.organization_id = 'COLE-O-ID-DA-ORG-AQUI'
-- ON CONFLICT (contact_id, tag_id) DO NOTHING;
