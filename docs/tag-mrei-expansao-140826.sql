-- ============================================================================
-- Aplicar a tag "MREIEXP140826" em todos os contatos que receberam o convite
-- do evento MREI Expansão — The Colony, 14/08.
--
-- Rodar no SQL Editor do Supabase, UMA PARTE POR VEZ, na ordem.
-- As PARTES 1 e 2 são só leitura. Nada muda no banco até a PARTE 3.
--
-- Texto de referência (só o primeiro nome muda):
--   "Oi Pamella, lembrei que você tem interesse nos nossos eventos de Dallas🔥
--    ... Estamos chegando na região The Colony ... 14 de agosto das 6 PM às 9PM
--    ... Responda EU VOU que eu te ajudo a concluir! Grande abraço, Raquel aqui"
-- ============================================================================


-- ============================================================================
-- PARTE 0 — CHECAGEM CRÍTICA (rodar ANTES de tudo)
--
-- A tag MREIEXP140826 já existe (workspace comercial) e os contatos alvo estão
-- todos no comercial. Mesmo assim, rode 0.2 e 4.0 — elas checam coisas que NÃO
-- dependem de onde os contatos estão hoje:
--
--   0.2: o trigger `trg_auto_assign_workspace_on_tag` move o contato para o
--        workspace que tiver a tag em `filter_tag_ids`. Se for o próprio
--        comercial, o UPDATE é no-op (a cláusula `workspace_id != _workspace_id`
--        protege). Mas se OUTRO workspace reivindicar a tag, os contatos saem
--        do comercial. É por isso que a pergunta é "qual workspace tem a tag no
--        filtro", não "onde os contatos estão".
--        (ver supabase/migrations/20260308200318_.sql, linhas 26-29)
--
--   4.0: campanha ativa na tag dispara mensagem real. Independe de workspace.
--
-- RESULTADO (rodado em 2026-07-29):
--   0.1 → tag existe, 1 org (a9896931-...), workspace Comercial, criada 29/07 23:36
--   0.2 → NENHUMA linha. Nenhum workspace usa a tag em filter_tag_ids, então o
--         trigger de workspace é inofensivo aqui. Risco 1 descartado.
--   0.3 → 84 contatos já tagueados (marcação começou manualmente).
--   4.0 → PENDENTE. É a única checagem que ainda importa.
-- ============================================================================

-- 0.1 — A tag existe em quais orgs / com qual escopo de workspace?
SELECT t.id, t.organization_id, t.name, t.workspace_id, w.name AS workspace, t.created_at
FROM public.tags t
LEFT JOIN public.workspaces w ON w.id = t.workspace_id
WHERE t.name = 'MREIEXP140826';

-- 0.2 — >>> DECISIVO <<< Algum workspace usa essa tag como filtro de entrada?
--       Se voltar QUALQUER linha, NÃO rode a PARTE 4 normal — use a 4-ALT,
--       que desliga o trigger e evita a movimentação em massa de contatos.




-- 0.3 — Quem já tem a tag hoje (a marcação pode ter começado manualmente):
SELECT COUNT(*) AS ja_tagueados
FROM public.contact_tags ct
JOIN public.tags t ON t.id = ct.tag_id
WHERE t.name = 'MREIEXP140826';


-- ============================================================================
-- PARTE 1 — DIAGNÓSTICO: achar o texto e conferir as variantes
-- ============================================================================

-- 1.1 — JÁ RODADA (2026-07-29). Resultado: o filtro definitivo é
--       `content ILIKE '%governo da sua vida%'` — frase exclusiva do convite de
--       agosto, presente em TODAS as variantes e ausente dos eventos de junho.
--
--       Variantes encontradas, todas do mesmo disparo (25-26/07), 0 falhas:
--         a) "Oi {NOME}, ..." — versão final, 6 PM às 9PM (maioria)
--         b) "Oi, ..." / "Oi , ..." — nome veio vazio na substituição (~10)
--         c) "... 7PM às 9PM / Tava de inscrição" — versão com typo, 2 contatos
--
--       O filtro antigo (The Colony OR EU VOU) pegava lixo: os eventos de
--       29/06 no Holiday Inn The Colony e frases soltas tipo "Eu vou passar
--       para eles..." (ILIKE é case-insensitive, "Eu vou" casava com "EU VOU").
--
--       Cuidado ao reler o resultado da 1.1: o GROUP BY incluía LEFT(content,120),
--       que ainda contém o nome real — por isso cada contato virou uma linha.
--       A versão abaixo agrupa só pela variante mascarada.
SELECT
  regexp_replace(m.content, '^\s*Oi\s*[^,]{0,40},', 'Oi {NOME},') AS variante,
  COUNT(*)                                   AS total_envios,
  COUNT(DISTINCT c.id)                       AS contatos_distintos,
  MIN(m.created_at)                          AS primeiro_envio,
  MAX(m.created_at)                          AS ultimo_envio,
  COUNT(*) FILTER (WHERE m.failed_at IS NOT NULL) AS falhas
FROM public.messages m
JOIN public.conversations conv ON conv.id = m.conversation_id
JOIN public.contacts c        ON c.id = conv.contact_id
WHERE m.direction = 'outbound'
  AND m.content ILIKE '%governo da sua vida%'
GROUP BY variante
ORDER BY total_envios DESC;

-- 1.3 — Fonte cruzada: a fila de campanha também guarda o texto renderizado.
--       Serve pra pegar quem ESTAVA na lista mas cuja mensagem não ficou
--       gravada em `messages` (envio pelo fluxo que falhou não grava linha).
--       Compare o total daqui com o total da 1.1.
SELECT
  cq.campaign_id,
  cmp.name                                     AS campanha,
  cq.status,
  COUNT(*)                                     AS itens,
  COUNT(DISTINCT cq.contact_id)                AS contatos_distintos,
  MIN(cq.scheduled_for)                        AS agendado_de,
  MAX(cq.scheduled_for)                        AS agendado_ate
FROM public.campaign_queue cq
LEFT JOIN public.campaigns cmp ON cmp.id = cq.campaign_id
WHERE cq.message_content ILIKE '%governo da sua vida%'
GROUP BY cq.campaign_id, cmp.name, cq.status
ORDER BY itens DESC;


-- ============================================================================
-- PARTE 2 — PREVIEW: exatamente quem vai receber a tag
-- ============================================================================
-- >>> AJUSTE O FILTRO AQUI (no CTE `alvo`) se a PARTE 1 pedir. É o único lugar
--     onde o filtro aparece nas PARTES 2, 3 e 4 — copie o mesmo CTE nas três.

WITH alvo AS (
  SELECT DISTINCT c.id AS contact_id, c.organization_id
  FROM public.messages m
  JOIN public.conversations conv ON conv.id = m.conversation_id
  JOIN public.contacts c        ON c.id = conv.contact_id
  WHERE m.direction = 'outbound'
    AND m.content ILIKE '%governo da sua vida%'
    -- Descomente para NÃO taguear quem teve falha registrada no envio:
    -- AND m.failed_at IS NULL
)
SELECT
  (SELECT COUNT(*) FROM alvo)                                AS total_contatos,
  (SELECT COUNT(DISTINCT organization_id) FROM alvo)          AS orgs_envolvidas,
  (SELECT COUNT(*) FROM alvo a
     JOIN public.contact_tags ct ON ct.contact_id = a.contact_id
     JOIN public.tags t ON t.id = ct.tag_id AND t.name = 'MREIEXP140826'
  )                                                          AS ja_tagueados;

-- 2.2 — Lista nominal (confira algumas linhas antes de aplicar):
WITH alvo AS (
  SELECT DISTINCT c.id AS contact_id, c.organization_id
  FROM public.messages m
  JOIN public.conversations conv ON conv.id = m.conversation_id
  JOIN public.contacts c        ON c.id = conv.contact_id
  WHERE m.direction = 'outbound'
    AND m.content ILIKE '%governo da sua vida%'
)
SELECT c.name, c.phone, c.organization_id, c.workspace_id
FROM alvo a
JOIN public.contacts c ON c.id = a.contact_id
ORDER BY c.name NULLS LAST;


-- ============================================================================
-- PARTE 3 — A TAG JÁ EXISTE (workspace comercial): NADA A CRIAR
--
-- Este INSERT existe só como rede de segurança para o caso de o alvo incluir
-- contatos de uma organização que ainda não tem a tag. A constraint é
-- UNIQUE(organization_id, name), então na org que já tem, isso é no-op — a tag
-- existente (e o workspace dela) é preservada.
--
-- Se a query 2.1 disser `orgs_envolvidas = 1`, pode pular esta parte inteira.
-- ============================================================================
INSERT INTO public.tags (organization_id, name, color, description, workspace_id)
SELECT DISTINCT
  c.organization_id,
  'MREIEXP140826',
  '#f97316',
  'Recebeu o convite MREI Expansao - The Colony, 14/08/2026',
  NULL::uuid   -- sem o cast, o Postgres infere `text` e a coluna é uuid
FROM public.messages m
JOIN public.conversations conv ON conv.id = m.conversation_id
JOIN public.contacts c        ON c.id = conv.contact_id
WHERE m.direction = 'outbound'
  AND m.content ILIKE '%governo da sua vida%'
ON CONFLICT (organization_id, name) DO NOTHING;


-- ============================================================================
-- PARTE 4 — APLICAR A TAG NOS CONTATOS
-- ============================================================================
-- ATENÇÃO — a tag JÁ EXISTE, então os dois triggers de contact_tags podem ter
-- efeito real (diferente do cenário de tag nova):
--
--   1) trg_auto_assign_workspace_on_tag — se algum workspace tiver a tag em
--      filter_tag_ids (query 0.2), MOVE o contato e TODAS as conversas dele
--      para aquele workspace, sobrescrevendo o workspace atual. Em massa.
--      Se esse workspace for o próprio comercial (onde os contatos já estão),
--      o UPDATE de contacts é no-op. As conversas ainda podem ser afetadas:
--      conversa com workspace_id NULL (caso conhecido das conversas em modo IA)
--      seria preenchida com o comercial. Efeito desejável, mas saiba que ocorre.
--   2) on_contact_tag_added_campaign — POST via pg_net para
--      trigger-campaign-on-tag. Se existir campanha ATIVA com trigger nessa
--      tag, ela DISPARA MENSAGEM para cada contato tagueado. Confirme com a
--      query 4.0 abaixo antes de rodar.
--
-- Se 0.2 ou 4.0 voltarem qualquer linha, use o bloco 4-ALT.

-- 4.0 — Existe campanha ativa ligada a essa tag?
--       O casamento é match_type='tag_added' AND trigger_keyword = <UUID da tag>
--       (o campo guarda o id da tag, não o nome).
SELECT cmp.id, cmp.name, cmp.is_active, cmp.match_type, cmp.workspace_id, cmp.flow_id
FROM public.campaigns cmp
JOIN public.tags t ON t.id::text = cmp.trigger_keyword
WHERE t.name = 'MREIEXP140826'
  AND cmp.match_type = 'tag_added'
  AND cmp.is_active = true;

INSERT INTO public.contact_tags (contact_id, tag_id, added_by_type)
SELECT DISTINCT c.id, t.id, 'manual'
FROM public.messages m
JOIN public.conversations conv ON conv.id = m.conversation_id
JOIN public.contacts c        ON c.id = conv.contact_id
JOIN public.tags t            ON t.organization_id = c.organization_id
                             AND t.name = 'MREIEXP140826'
WHERE m.direction = 'outbound'
  AND m.content ILIKE '%governo da sua vida%'
ON CONFLICT (contact_id, tag_id) DO NOTHING;


-- --- 4-ALT — marcação "seca": os dois triggers desligados. Use este bloco se a
--     query 0.2 (workspace com a tag em filter_tag_ids) ou a 4.0 (campanha ativa
--     na tag) tiverem voltado qualquer linha.
--     Rode o bloco INTEIRO de uma vez. Se rodar em pedaços e algo falhar no
--     meio, os triggers ficam desativados no banco — o COMMIT/ROLLBACK da
--     transação é o que garante a reativação.
-- BEGIN;
--   ALTER TABLE public.contact_tags DISABLE TRIGGER trg_auto_assign_workspace_on_tag;
--   ALTER TABLE public.contact_tags DISABLE TRIGGER on_contact_tag_added_campaign;
--
--   INSERT INTO public.contact_tags (contact_id, tag_id, added_by_type)
--   SELECT DISTINCT c.id, t.id, 'manual'
--   FROM public.messages m
--   JOIN public.conversations conv ON conv.id = m.conversation_id
--   JOIN public.contacts c        ON c.id = conv.contact_id
--   JOIN public.tags t            ON t.organization_id = c.organization_id
--                                AND t.name = 'MREIEXP140826'
--   WHERE m.direction = 'outbound'
--     AND m.content ILIKE '%governo da sua vida%'
--   ON CONFLICT (contact_id, tag_id) DO NOTHING;
--
--   ALTER TABLE public.contact_tags ENABLE TRIGGER on_contact_tag_added_campaign;
--   ALTER TABLE public.contact_tags ENABLE TRIGGER trg_auto_assign_workspace_on_tag;
-- COMMIT;

-- 4-ALT.1 — Depois do bloco acima, confirme que os dois triggers voltaram
--           (tgenabled deve ser 'O' nas duas linhas; 'D' = ainda desativado):
-- SELECT tgname, tgenabled FROM pg_trigger
-- WHERE tgrelid = 'public.contact_tags'::regclass AND NOT tgisinternal;


-- ============================================================================
-- PARTE 5 — VERIFICAÇÃO
-- ============================================================================
SELECT
  t.organization_id,
  COUNT(ct.contact_id) AS contatos_com_a_tag
FROM public.tags t
LEFT JOIN public.contact_tags ct ON ct.tag_id = t.id
WHERE t.name = 'MREIEXP140826'
GROUP BY t.organization_id;

-- 5.2 — Quem estava na fila da campanha mas NÃO ficou com a tag
--       (mensagem não gravada em `messages`, provavelmente falha de envio).
--       Se voltar linhas, decida se eles também devem ser tagueados.
SELECT DISTINCT c.id, c.name, c.phone, cq.status, cq.scheduled_for
FROM public.campaign_queue cq
JOIN public.contacts c ON c.id = cq.contact_id
WHERE cq.message_content ILIKE '%governo da sua vida%'
  AND NOT EXISTS (
    SELECT 1 FROM public.contact_tags ct
    JOIN public.tags t ON t.id = ct.tag_id
    WHERE ct.contact_id = c.id AND t.name = 'MREIEXP140826'
  );


-- ============================================================================
-- ROLLBACK — desfaz só a marcação (mantém a tag criada)
-- ============================================================================
-- DELETE FROM public.contact_tags ct
-- USING public.tags t
-- WHERE ct.tag_id = t.id AND t.name = 'MREIEXP140826';
--
-- Para remover a tag também. NÃO use delete_tag_safely: essa função está no
-- repo mas nunca foi aplicada no banco vivo. Delete direto — contact_tags tem
-- ON DELETE CASCADE, mas confira antes se nenhuma campanha/agendamento aponta
-- pra ela (as FKs de campaigns/scheduled_messages não são cascade):
-- DELETE FROM public.tags WHERE name = 'MREIEXP140826';
