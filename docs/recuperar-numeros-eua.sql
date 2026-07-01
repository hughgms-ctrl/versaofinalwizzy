-- ============================================================================
-- Recuperação de números dos EUA corrompidos (perderam o código de país +1)
-- ----------------------------------------------------------------------------
-- Contexto: o pipeline de telefone era hardcoded para o Brasil (55). Números
-- que chegaram do WhatsApp com código de país estrangeiro (ex.: EUA +1) foram
-- estragados: ou ficaram como 10 dígitos crus (ex.: 8572664160), ou receberam
-- um 55 colado na frente do número já completo (ex.: 5518572428596).
--
-- A correção estrutural (#1) já impede NOVAS corrupções. Este script recupera
-- as contas JÁ estragadas. RODE PASSO A PASSO, no SQL Editor do Supabase.
--
-- >>> ANTES DE QUALQUER UPDATE: rode o PASSO 1 (preview) e confira os grupos. <<<
--
-- Substitua :tag_id pelo ID da tag do disparo (ou troque o filtro por t.name).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASSO 0 — descobrir o tag_id (se você só tem o nome da tag)
-- ----------------------------------------------------------------------------
-- SELECT id, name FROM tags WHERE name ILIKE '%NOME_DA_TAG%';


-- ----------------------------------------------------------------------------
-- PASSO 1 — PREVIEW: categoriza os contatos da tag SEM alterar nada.
--   Confira principalmente as colunas "categoria" e "phone_sugerido".
-- ----------------------------------------------------------------------------
WITH alvo AS (
  SELECT c.id, c.name, regexp_replace(c.phone, '\D', '', 'g') AS d
  FROM contacts c
  JOIN contact_tags ct ON ct.contact_id = c.id
  WHERE ct.tag_id = :tag_id           -- <<< troque pelo ID da tag
)
SELECT
  id,
  name,
  d AS phone_atual,
  CASE
    -- Brasil já correto (55 + DDD + 8/9 dígitos): NÃO mexer
    WHEN d LIKE '55%' AND length(d) BETWEEN 12 AND 13
         AND substr(d,3,2)::int BETWEEN 11 AND 99
         AND (length(d) = 12 OR substr(d,5,1) = '9')
      THEN 'BR_OK'
    -- EUA cru: exatamente 10 dígitos, sem código de país → falta o 1
    WHEN length(d) = 10
      THEN 'US_CRU_10'
    -- EUA com 55 colado num E.164 já completo (55 + 1 + 10 = 13, e o pós-55
    -- NÃO tem o 9 de celular BR na 3ª posição → não é BR)
    WHEN d LIKE '551%' AND length(d) = 13 AND substr(d,5,1) <> '9'
      THEN 'US_COM_55'
    ELSE 'REVISAR'
  END AS categoria,
  CASE
    WHEN length(d) = 10 THEN '1' || d
    WHEN d LIKE '551%' AND length(d) = 13 AND substr(d,5,1) <> '9' THEN substr(d, 3)
    ELSE d
  END AS phone_sugerido
FROM alvo
ORDER BY categoria, name;


-- ----------------------------------------------------------------------------
-- PASSO 2A — APLICAR: EUA cru (10 dígitos) → prefixa 1.
--   Só rode depois de conferir que a categoria US_CRU_10 está correta no PASSO 1.
-- ----------------------------------------------------------------------------
-- UPDATE contacts c
-- SET phone = '1' || regexp_replace(c.phone, '\D', '', 'g'),
--     updated_at = now()
-- FROM contact_tags ct
-- WHERE ct.contact_id = c.id
--   AND ct.tag_id = :tag_id
--   AND regexp_replace(c.phone, '\D', '', 'g') ~ '^[0-9]{10}$';


-- ----------------------------------------------------------------------------
-- PASSO 2B — APLICAR: EUA com 55 colado (551 + 10, sem 9 de celular BR) → tira o 55.
--   Confira a categoria US_COM_55 no PASSO 1 antes de rodar.
-- ----------------------------------------------------------------------------
-- UPDATE contacts c
-- SET phone = substr(regexp_replace(c.phone, '\D', '', 'g'), 3),
--     updated_at = now()
-- FROM contact_tags ct
-- WHERE ct.contact_id = c.id
--   AND ct.tag_id = :tag_id
--   AND regexp_replace(c.phone, '\D', '', 'g') LIKE '551%'
--   AND length(regexp_replace(c.phone, '\D', '', 'g')) = 13
--   AND substr(regexp_replace(c.phone, '\D', '', 'g'), 5, 1) <> '9';


-- ----------------------------------------------------------------------------
-- PASSO 3 — CONFERIR pós-correção: reveja se sobrou algo em 'REVISAR'.
--   (Rode o PASSO 1 de novo; idealmente só restam BR_OK e os US já com 1... na frente.)
-- ----------------------------------------------------------------------------

-- OBS: mesmo com o formato corrigido, número dos EUA tem baixa adesão ao
-- WhatsApp — vários ainda vão retornar exists:false por não terem conta.
