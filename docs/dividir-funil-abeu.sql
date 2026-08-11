-- ============================================================================
-- DIVIDIR EM 2 METADES: FUNIL1ABEU / FUNIL2ABEU
-- ============================================================================
-- Público-alvo: contatos que têm AS DUAS tags DISPAROFUNIL090826 E TEXAS.
-- Divisão: aleatória, metade para cada tag.
-- As tags FUNIL1ABEU e FUNIL2ABEU precisam JÁ EXISTIR (o script não cria).
--
-- ORDEM DE USO:
--   Passo 1  -> confere se as tags existem  (só leitura)
--   Passo 2  -> confere o tamanho do público (só leitura)
--   Passo 3  -> APLICA (escreve) — rode dentro do BEGIN/COMMIT
--   Passo 4  -> confere o resultado (só leitura)
-- ============================================================================


-- ============================================================================
-- PASSO 1 — as 4 tags existem? (só leitura)
-- ============================================================================
-- Se alguma linha vier com existe = false, PARE: crie a tag na interface antes.
SELECT
  t.nome_esperado,
  (tags.id IS NOT NULL) AS existe,
  tags.id               AS tag_id,
  tags.organization_id
FROM (VALUES
  ('DISPAROFUNIL090826'), ('TEXAS'), ('FUNIL1ABEU'), ('FUNIL2ABEU')
) AS t(nome_esperado)
LEFT JOIN tags ON tags.name = t.nome_esperado
ORDER BY t.nome_esperado;


-- ============================================================================
-- PASSO 2 — quantas pessoas têm AS DUAS tags? (só leitura)
-- ============================================================================
-- Confira este número antes de aplicar. Se vier 0, provavelmente o nome de
-- alguma tag está diferente (maiúsculas/acentos) — ajuste no PASSO 1.
WITH alvo AS (
  SELECT ct.contact_id
  FROM contact_tags ct
  JOIN tags t ON t.id = ct.tag_id
  WHERE t.name IN ('DISPAROFUNIL090826', 'TEXAS')
  GROUP BY ct.contact_id
  HAVING COUNT(DISTINCT t.name) = 2      -- <- exige AS DUAS
)
SELECT
  COUNT(*)                        AS total_publico,
  CEIL(COUNT(*) / 2.0)            AS ira_para_FUNIL2ABEU,
  FLOOR(COUNT(*) / 2.0)           AS ira_para_FUNIL1ABEU
FROM alvo;


-- ============================================================================
-- PASSO 3 — APLICAR (ESCREVE!)
-- ============================================================================
-- Roda tudo junto, do BEGIN até o COMMIT.
-- Se algo parecer errado no resultado, troque COMMIT por ROLLBACK e nada é salvo.
--
-- Em caso de ímpar, a metade maior vai para FUNIL2ABEU.
-- Contatos que JÁ tenham uma dessas tags não são duplicados (ON CONFLICT).

BEGIN;

WITH alvo AS (
  SELECT ct.contact_id
  FROM contact_tags ct
  JOIN tags t ON t.id = ct.tag_id
  WHERE t.name IN ('DISPAROFUNIL090826', 'TEXAS')
  GROUP BY ct.contact_id
  HAVING COUNT(DISTINCT t.name) = 2
),
sorteado AS (
  -- random() define a metade; ROW_NUMBER congela o sorteio para esta execução
  SELECT
    contact_id,
    ROW_NUMBER() OVER (ORDER BY random()) AS rn,
    COUNT(*)    OVER ()                   AS total
  FROM alvo
),
destino AS (
  SELECT
    s.contact_id,
    CASE WHEN s.rn <= CEIL(s.total / 2.0)
         THEN 'FUNIL2ABEU'
         ELSE 'FUNIL1ABEU'
    END AS tag_destino
  FROM sorteado s
)
-- added_by_type aceita apenas: manual, flow, ai, whatsapp, import.
INSERT INTO contact_tags (contact_id, tag_id, added_by_type)
SELECT d.contact_id, t.id, 'manual'
FROM destino d
JOIN tags t ON t.name = d.tag_destino
ON CONFLICT DO NOTHING;

-- Confira o que acabou de ser inserido ANTES de confirmar:
SELECT t.name AS tag, COUNT(*) AS pessoas
FROM contact_tags ct
JOIN tags t ON t.id = ct.tag_id
WHERE t.name IN ('FUNIL1ABEU', 'FUNIL2ABEU')
GROUP BY t.name
ORDER BY t.name;

COMMIT;
-- ROLLBACK;   <- use este no lugar do COMMIT se os números vierem errados


-- ============================================================================
-- PASSO 4 — conferir o resultado (só leitura)
-- ============================================================================
-- As duas metades devem somar o total do PASSO 2, e ninguém deve estar nas duas.
WITH alvo AS (
  SELECT ct.contact_id
  FROM contact_tags ct
  JOIN tags t ON t.id = ct.tag_id
  WHERE t.name IN ('DISPAROFUNIL090826', 'TEXAS')
  GROUP BY ct.contact_id
  HAVING COUNT(DISTINCT t.name) = 2
)
SELECT
  (SELECT COUNT(*) FROM alvo)                                   AS publico_total,
  COUNT(*) FILTER (WHERE t.name = 'FUNIL2ABEU')                 AS em_funil2,
  COUNT(*) FILTER (WHERE t.name = 'FUNIL1ABEU')                 AS em_funil1,
  COUNT(DISTINCT ct.contact_id) FILTER (
    WHERE t.name IN ('FUNIL1ABEU','FUNIL2ABEU')
  )                                                             AS pessoas_marcadas
FROM contact_tags ct
JOIN tags t ON t.id = ct.tag_id
WHERE ct.contact_id IN (SELECT contact_id FROM alvo)
  AND t.name IN ('FUNIL1ABEU', 'FUNIL2ABEU');


-- ============================================================================
-- DESFAZER (se precisar refazer o sorteio)
-- ============================================================================
-- Remove as duas tags APENAS do público-alvo, deixando o resto intacto.
-- DELETE FROM contact_tags ct
-- USING tags t
-- WHERE ct.tag_id = t.id
--   AND t.name IN ('FUNIL1ABEU', 'FUNIL2ABEU')
--   AND ct.contact_id IN (
--     SELECT ct2.contact_id FROM contact_tags ct2
--     JOIN tags t2 ON t2.id = ct2.tag_id
--     WHERE t2.name IN ('DISPAROFUNIL090826', 'TEXAS')
--     GROUP BY ct2.contact_id HAVING COUNT(DISTINCT t2.name) = 2
--   );
