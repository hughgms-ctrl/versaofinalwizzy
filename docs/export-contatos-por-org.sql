-- =====================================================================
-- EXPORTAR TODOS OS CONTATOS DE UMA ORGANIZAÇÃO (com tags e workspace)
-- Rodar no SQL Editor do Supabase (service role ignora RLS).
-- Para baixar em CSV: botão "Download CSV" abaixo do resultado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASSO 1 — descobrir o organization_id (se você só sabe o nome)
-- ---------------------------------------------------------------------
SELECT
  o.id,
  o.name,
  (SELECT count(*) FROM contacts c WHERE c.organization_id = o.id) AS total_contatos
FROM organizations o
ORDER BY total_contatos DESC;


-- ---------------------------------------------------------------------
-- PASSO 2 — export completo: 1 linha por contato, tags concatenadas
--   Troque o UUID abaixo pelo org escolhido no passo 1.
--   (Global Training = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc')
-- LEFT JOIN em tudo: contato sem tag e sem workspace continua aparecendo.
-- ---------------------------------------------------------------------
SELECT
  c.id                                            AS contato_id,
  c.name                                          AS nome,
  c.phone                                         AS telefone,
  c.email,
  w.name                                          AS workspace,
  string_agg(t.name, ', ' ORDER BY t.name)        AS tags,
  count(t.id)                                     AS qtd_tags,
  c.created_at                                    AS criado_em,
  c.updated_at                                    AS atualizado_em
FROM contacts c
LEFT JOIN workspaces   w  ON w.id  = c.workspace_id
LEFT JOIN contact_tags ct ON ct.contact_id = c.id
LEFT JOIN tags         t  ON t.id  = ct.tag_id
WHERE c.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
GROUP BY c.id, c.name, c.phone, c.email, w.name, c.created_at, c.updated_at
ORDER BY c.created_at DESC;


-- ---------------------------------------------------------------------
-- VARIANTE A — só os contatos, sem tags (mais rápido, CSV limpo)
-- ---------------------------------------------------------------------
-- SELECT c.name AS nome, c.phone AS telefone, c.email
-- FROM contacts c
-- WHERE c.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
-- ORDER BY c.name;


-- ---------------------------------------------------------------------
-- VARIANTE B — 1 linha por par contato×tag (bom p/ planilha dinâmica)
-- ---------------------------------------------------------------------
-- SELECT c.name AS nome, c.phone AS telefone, t.name AS tag, t.color
-- FROM contacts c
-- JOIN contact_tags ct ON ct.contact_id = c.id
-- JOIN tags t          ON t.id = ct.tag_id
-- WHERE c.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
-- ORDER BY c.name, t.name;


-- ---------------------------------------------------------------------
-- VARIANTE C — filtrar por uma tag específica
-- ---------------------------------------------------------------------
-- SELECT c.name AS nome, c.phone AS telefone
-- FROM contacts c
-- JOIN contact_tags ct ON ct.contact_id = c.id
-- JOIN tags t          ON t.id = ct.tag_id
-- WHERE c.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
--   AND t.name = 'NOME_DA_TAG'
-- ORDER BY c.name;


-- =====================================================================
-- EXPORT COM EXCLUSÃO DE TAGS  (pedido 2026-08-17)
-- "todos os contatos da Global Training, EXCETO quem tem
--  FUNIL1ABEU, FUNIL2ABEU ou DISPAROFUNIL090826"
-- =====================================================================

-- PASSO A — conferir os nomes exatos das tags (case/acento/espaço)
--   Se alguma das 3 não aparecer aqui, o nome está diferente no banco.
SELECT t.id, t.name, count(ct.contact_id) AS contatos
FROM tags t
LEFT JOIN contact_tags ct ON ct.tag_id = t.id
WHERE t.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
GROUP BY t.id, t.name
ORDER BY t.name;


-- PASSO B — export final (1 linha por contato, tags restantes concatenadas)
--   A comparação usa upper(trim(...)) p/ não depender de maiúscula/espaço.
SELECT
  c.id                                     AS contato_id,
  c.name                                   AS nome,
  c.phone                                  AS telefone,
  c.email,
  w.name                                   AS workspace,
  string_agg(t.name, ', ' ORDER BY t.name) AS tags,
  c.created_at                             AS criado_em
FROM contacts c
LEFT JOIN workspaces   w  ON w.id = c.workspace_id
LEFT JOIN contact_tags ct ON ct.contact_id = c.id
LEFT JOIN tags         t  ON t.id = ct.tag_id
WHERE c.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
  AND NOT EXISTS (
    SELECT 1
    FROM contact_tags ctx
    JOIN tags tx ON tx.id = ctx.tag_id
    WHERE ctx.contact_id = c.id
      AND upper(trim(tx.name)) IN ('FUNIL1ABEU', 'FUNIL2ABEU', 'DISPAROFUNIL090826')
  )
GROUP BY c.id, c.name, c.phone, c.email, w.name, c.created_at
ORDER BY c.created_at DESC;


-- PASSO C — conferência de números (total / excluídos / exportados)
SELECT
  count(*) FILTER (WHERE excluido)       AS contatos_excluidos,
  count(*) FILTER (WHERE NOT excluido)   AS contatos_exportados,
  count(*)                               AS total_org
FROM (
  SELECT c.id,
         EXISTS (
           SELECT 1 FROM contact_tags ctx
           JOIN tags tx ON tx.id = ctx.tag_id
           WHERE ctx.contact_id = c.id
             AND upper(trim(tx.name)) IN ('FUNIL1ABEU', 'FUNIL2ABEU', 'DISPAROFUNIL090826')
         ) AS excluido
  FROM contacts c
  WHERE c.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
) s;


-- VARIANTE — só nome + telefone, CSV limpo p/ importar em disparo
-- SELECT c.name AS nome, c.phone AS telefone
-- FROM contacts c
-- WHERE c.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
--   AND NOT EXISTS (
--     SELECT 1 FROM contact_tags ctx
--     JOIN tags tx ON tx.id = ctx.tag_id
--     WHERE ctx.contact_id = c.id
--       AND upper(trim(tx.name)) IN ('FUNIL1ABEU', 'FUNIL2ABEU', 'DISPAROFUNIL090826')
--   )
-- ORDER BY c.name;


-- ---------------------------------------------------------------------
-- VARIANTE D — export em JSON (1 linha só, útil p/ reimportar)
-- ---------------------------------------------------------------------
-- SELECT jsonb_agg(x) FROM (
--   SELECT c.id, c.name, c.phone, c.email, c.workspace_id,
--          coalesce(jsonb_agg(t.name) FILTER (WHERE t.id IS NOT NULL), '[]'::jsonb) AS tags
--   FROM contacts c
--   LEFT JOIN contact_tags ct ON ct.contact_id = c.id
--   LEFT JOIN tags t          ON t.id = ct.tag_id
--   WHERE c.organization_id = 'a9896931-7d69-4823-b5b4-c1dcd5c8d7fc'
--   GROUP BY c.id
-- ) x;
