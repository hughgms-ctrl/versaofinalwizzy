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


-- ============================================================================
-- VERSÃO WORKSPACE-WIDE — trata TODOS os contatos de um workspace.
-- Use quando o workspace é majoritariamente americano. MESMO cuidado do topo:
-- rode o PREVIEW e confira antes de aplicar. Atenção especial ao US_CRU_10 —
-- um fixo BR cru (10 díg. sem 55) seria confundido com US. Passe o olho na lista.
-- ============================================================================

-- PASSO W0 — descobrir o workspace_id
-- SELECT id, name FROM workspaces ORDER BY name;

-- PASSO W1 — RESUMO por categoria (contagem). Substitua :ws pelo workspace_id.
WITH alvo AS (
  SELECT regexp_replace(phone, '\D', '', 'g') AS d
  FROM contacts
  WHERE workspace_id = :ws
)
SELECT
  CASE
    WHEN d LIKE '55%' AND length(d) BETWEEN 12 AND 13
         AND substr(d,3,2)::int BETWEEN 11 AND 99
         AND (length(d) = 12 OR substr(d,5,1) = '9') THEN 'BR_OK'
    WHEN length(d) = 10 THEN 'US_CRU_10'
    WHEN d LIKE '551%' AND length(d) = 13 AND substr(d,5,1) <> '9' THEN 'US_COM_55'
    ELSE 'REVISAR'
  END AS categoria,
  count(*) AS qtd
FROM alvo GROUP BY 1 ORDER BY qtd DESC;

-- PASSO W2 — PREVIEW detalhado (confira nomes vs categoria/sugerido)
WITH alvo AS (
  SELECT id, name, regexp_replace(phone, '\D', '', 'g') AS d
  FROM contacts WHERE workspace_id = :ws
)
SELECT id, name, d AS phone_atual,
  CASE
    WHEN d LIKE '55%' AND length(d) BETWEEN 12 AND 13
         AND substr(d,3,2)::int BETWEEN 11 AND 99
         AND (length(d) = 12 OR substr(d,5,1) = '9') THEN 'BR_OK'
    WHEN length(d) = 10 THEN 'US_CRU_10'
    WHEN d LIKE '551%' AND length(d) = 13 AND substr(d,5,1) <> '9' THEN 'US_COM_55'
    ELSE 'REVISAR'
  END AS categoria,
  CASE
    WHEN length(d) = 10 THEN '1' || d
    WHEN d LIKE '551%' AND length(d) = 13 AND substr(d,5,1) <> '9' THEN substr(d, 3)
    ELSE d
  END AS phone_sugerido
FROM alvo ORDER BY categoria, name;

-- PASSO W3B — APLICAR US com 55 colado (551+13 sem 9). RODE ESTE PRIMEIRO.
--   NOT EXISTS: pula quem colidiria com um contato já existente (duplicado).
-- UPDATE contacts c
-- SET phone = substr(regexp_replace(c.phone,'\D','','g'),3), updated_at = now()
-- WHERE c.workspace_id = :ws
--   AND regexp_replace(c.phone,'\D','','g') LIKE '551%'
--   AND length(regexp_replace(c.phone,'\D','','g')) = 13
--   AND substr(regexp_replace(c.phone,'\D','','g'),5,1) <> '9'
--   AND NOT EXISTS (
--     SELECT 1 FROM contacts c2
--     WHERE c2.organization_id = c.organization_id AND c2.id <> c.id
--       AND regexp_replace(c2.phone,'\D','','g') = substr(regexp_replace(c.phone,'\D','','g'),3)
--   );

-- PASSO W3A — APLICAR US cru (10 díg. → prefixa 1). RODE DEPOIS do W3B.
-- UPDATE contacts c
-- SET phone = '1' || regexp_replace(c.phone,'\D','','g'), updated_at = now()
-- WHERE c.workspace_id = :ws
--   AND regexp_replace(c.phone,'\D','','g') ~ '^[0-9]{10}$'
--   AND NOT EXISTS (
--     SELECT 1 FROM contacts c2
--     WHERE c2.organization_id = c.organization_id AND c2.id <> c.id
--       AND regexp_replace(c2.phone,'\D','','g') = '1' || regexp_replace(c.phone,'\D','','g')
--   );

-- PASSO W4 — LEFTOVERS: US que NÃO normalizaram (colidiram = duplicados a mesclar)
-- WITH alvo AS (
--   SELECT id, name, regexp_replace(phone,'\D','','g') AS d FROM contacts WHERE workspace_id = :ws
-- )
-- SELECT id, name, d AS phone_atual,
--   CASE WHEN length(d)=10 THEN '1'||d
--        WHEN d LIKE '551%' AND length(d)=13 AND substr(d,5,1)<>'9' THEN substr(d,3) END AS duplica_de
-- FROM alvo
-- WHERE length(d)=10 OR (d LIKE '551%' AND length(d)=13 AND substr(d,5,1)<>'9')
-- ORDER BY duplica_de;


-- ============================================================================
-- PASSO W5 — MESCLAR os duplicados que sobraram (leftovers do W4).
-- PRÉ-REQUISITOS OBRIGATÓRIOS:
--   (a) rodou o backup: CREATE TABLE contacts_backup_... AS SELECT * FROM contacts;
--   (b) rodou W3B e W3A (para que cada leftover tenha um gêmeo já canônico).
-- Regra: sobrevive quem tem mais mensagens; o perdedor (0 msgs) tem tags/refs
-- movidas pro sobrevivente e é apagado; o sobrevivente fica com o número certo.
-- Bloco ATÔMICO: qualquer erro faz rollback de tudo.
-- ============================================================================
-- DO $$
-- DECLARE r RECORD; s uuid; x uuid; canon text;
-- BEGIN
--   FOR r IN
--     SELECT L.id AS l_id, K.id AS k_id,
--       CASE WHEN length(regexp_replace(L.phone,'\D','','g'))=10
--            THEN '1'||regexp_replace(L.phone,'\D','','g')
--            ELSE substr(regexp_replace(L.phone,'\D','','g'),3) END AS canon,
--       (SELECT count(*) FROM messages m JOIN conversations cv ON cv.id=m.conversation_id WHERE cv.contact_id=L.id) AS l_msgs,
--       (SELECT count(*) FROM messages m JOIN conversations cv ON cv.id=m.conversation_id WHERE cv.contact_id=K.id) AS k_msgs
--     FROM contacts L
--     JOIN contacts K ON K.organization_id=L.organization_id AND K.id<>L.id
--       AND regexp_replace(K.phone,'\D','','g') =
--           CASE WHEN length(regexp_replace(L.phone,'\D','','g'))=10
--                THEN '1'||regexp_replace(L.phone,'\D','','g')
--                ELSE substr(regexp_replace(L.phone,'\D','','g'),3) END
--     WHERE L.workspace_id = :ws
--       AND ( regexp_replace(L.phone,'\D','','g') ~ '^[0-9]{10}$'
--          OR (regexp_replace(L.phone,'\D','','g') LIKE '551%'
--              AND length(regexp_replace(L.phone,'\D','','g'))=13
--              AND substr(regexp_replace(L.phone,'\D','','g'),5,1)<>'9') )
--   LOOP
--     IF r.l_msgs > r.k_msgs THEN s:=r.l_id; x:=r.k_id; ELSE s:=r.k_id; x:=r.l_id; END IF;
--     canon := r.canon;
--     -- tabelas com unique em contact_id: move só o que não duplica
--     UPDATE contact_tags t SET contact_id=s WHERE t.contact_id=x
--       AND NOT EXISTS (SELECT 1 FROM contact_tags t2 WHERE t2.contact_id=s AND t2.tag_id=t.tag_id);
--     UPDATE scheduled_message_contacts a SET contact_id=s WHERE a.contact_id=x
--       AND NOT EXISTS (SELECT 1 FROM scheduled_message_contacts b WHERE b.contact_id=s AND b.scheduled_message_id=a.scheduled_message_id);
--     UPDATE contact_presence p SET contact_id=s WHERE p.contact_id=x
--       AND NOT EXISTS (SELECT 1 FROM contact_presence q WHERE q.contact_id=s);
--     -- conversas do perdedor estão vazias (0 msgs) -> apaga
--     DELETE FROM conversations WHERE contact_id=x;
--     -- demais tabelas: reatribui direto
--     UPDATE calendar_bookings   SET contact_id=s WHERE contact_id=x;
--     UPDATE campaign_queue      SET contact_id=s WHERE contact_id=x;
--     UPDATE cases               SET contact_id=s WHERE contact_id=x;
--     UPDATE contact_files       SET contact_id=s WHERE contact_id=x;
--     UPDATE contact_folders     SET contact_id=s WHERE contact_id=x;
--     UPDATE contact_notes       SET contact_id=s WHERE contact_id=x;
--     UPDATE crm_entries         SET contact_id=s WHERE contact_id=x;
--     UPDATE document_signatures SET contact_id=s WHERE contact_id=x;
--     UPDATE generated_documents SET contact_id=s WHERE contact_id=x;
--     UPDATE quiz_submissions    SET contact_id=s WHERE contact_id=x;
--     UPDATE scheduled_messages  SET contact_id=s WHERE contact_id=x;
--     UPDATE widget_submissions  SET contact_id=s WHERE contact_id=x;
--     -- limpa sobras das tabelas unique (as que não moveram por já existirem)
--     DELETE FROM contact_tags               WHERE contact_id=x;
--     DELETE FROM scheduled_message_contacts WHERE contact_id=x;
--     DELETE FROM contact_presence           WHERE contact_id=x;
--     -- apaga o perdedor e corrige o número do sobrevivente
--     DELETE FROM contacts WHERE id=x;
--     UPDATE contacts SET phone=canon, updated_at=now() WHERE id=s;
--   END LOOP;
-- END $$;
