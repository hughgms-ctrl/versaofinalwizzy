-- ============================================================================
-- Unificação de CONVERSAS (chats) DUPLICADAS
-- ----------------------------------------------------------------------------
-- Contexto: aparecem chats duplicados do mesmo contato na lista de conversas.
-- A identidade da conversa é (contact_id, organization_id, whatsapp_instance_id)
-- e o índice único idx_conversations_contact_org_instance_unique é PARCIAL
-- (só vale quando whatsapp_instance_id IS NOT NULL). Ou seja:
--   • Conversas ÓRFÃS / de IA (whatsapp_instance_id NULL) NÃO têm proteção de
--     unicidade — o mesmo contato pode acumular várias, e o handler de corrida
--     23505 do zapi-webhook nem dispara nesse caso.
--   • Conversas com instância real só duplicariam se já existissem duplicatas
--     ANTES do índice único ter sido criado.
--
-- Este script:
--   PARTE 1 — DIAGNÓSTICO (read-only): mostra os grupos duplicados e o formato
--             (mesma instância? órfãs NULL? mesmo número via source_phone?).
--   PARTE 2 — MERGE seguro e idempotente: mantém a conversa "keeper" (mais
--             recente) de cada grupo, RE-APONTA dinamicamente TODAS as FKs que
--             referenciam conversations.id (messages, flow_executions,
--             conversation_origin_audit, cases, etc. — sem precisar enumerar),
--             mescla unread/last_message/metadata e apaga as duplicatas.
--
-- REGRA DE NEGÓCIO PRESERVADA: "2 números = 2 chats". O agrupamento NUNCA cruza
-- instâncias diferentes. Para órfãs (NULL) agrupa por número (source_phone) via
-- whatsapp_phone_match_key — órfãs de números diferentes ficam separadas.
--
-- >>> RODE A PARTE 1 PRIMEIRO e me mande o resultado antes da PARTE 2. <<<
-- Aplicação: MANUAL no SQL Editor do Supabase (regra de deploy Lovable).
-- ============================================================================


-- ============================================================================
-- PARTE 0 — PRÉ-REQUISITO: função de normalização de telefone.
--   Definida na migration 20260522210000, mas o banco vivo pode não tê-la
--   (drift de deploy). CREATE OR REPLACE é idempotente e seguro. É a MESMA
--   definição da migration — tolera DDI 55 e o 9º dígito de celular BR.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.whatsapp_phone_match_key(raw_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH clean AS (
    SELECT regexp_replace(coalesce(raw_phone, ''), '\D', '', 'g') AS digits
  ),
  no_country AS (
    SELECT CASE
      WHEN digits LIKE '55%' AND length(digits) >= 12 THEN substr(digits, 3)
      ELSE digits
    END AS local_digits
    FROM clean
  )
  SELECT CASE
    WHEN length(local_digits) = 11 AND substr(local_digits, 3, 1) = '9'
      THEN substr(local_digits, 1, 2) || substr(local_digits, 4)
    ELSE local_digits
  END
  FROM no_country;
$$;


-- ============================================================================
-- PARTE 1 — DIAGNÓSTICO (não altera nada)
-- ============================================================================

-- 1a) Visão geral: quantos grupos duplicados e de que tipo.
WITH grupos AS (
  SELECT
    organization_id,
    contact_id,
    CASE
      WHEN whatsapp_instance_id IS NOT NULL
        THEN 'instance:' || whatsapp_instance_id::text
      ELSE 'orphan:' || COALESCE(NULLIF(public.whatsapp_phone_match_key(source_phone), ''), 'sem_numero')
    END AS scope_key,
    count(*) AS qtd
  FROM public.conversations
  GROUP BY 1, 2, 3
  HAVING count(*) > 1
)
SELECT
  CASE WHEN scope_key LIKE 'instance:%' THEN 'mesma_instancia'
       WHEN scope_key LIKE 'orphan:sem_numero' THEN 'orfa_sem_numero'
       ELSE 'orfa_mesmo_numero' END AS tipo_duplicacao,
  count(*) AS grupos_duplicados,
  sum(qtd) AS conversas_envolvidas,
  sum(qtd) - count(*) AS conversas_a_remover
FROM grupos
GROUP BY 1
ORDER BY 1;

-- 1b) Detalhe linha a linha (confira antes de mesclar). Mostra o contato, o
--     escopo, e cada conversa do grupo com atividade e nº de mensagens.
WITH grupos AS (
  SELECT
    id, organization_id, contact_id, whatsapp_instance_id, source_phone,
    last_message_at, created_at, unread_count, status,
    CASE
      WHEN whatsapp_instance_id IS NOT NULL
        THEN 'instance:' || whatsapp_instance_id::text
      ELSE 'orphan:' || COALESCE(NULLIF(public.whatsapp_phone_match_key(source_phone), ''), 'sem_numero')
    END AS scope_key
  FROM public.conversations
),
dups AS (
  SELECT scope_key, organization_id, contact_id
  FROM grupos
  GROUP BY scope_key, organization_id, contact_id
  HAVING count(*) > 1
)
SELECT
  ct.name AS contato,
  ct.phone AS telefone,
  g.scope_key,
  g.id AS conversation_id,
  g.status,
  g.source_phone,
  g.last_message_at,
  g.created_at,
  g.unread_count,
  (SELECT count(*) FROM public.messages m WHERE m.conversation_id = g.id) AS msgs
FROM grupos g
JOIN dups d
  ON d.scope_key = g.scope_key
 AND d.organization_id = g.organization_id
 AND d.contact_id = g.contact_id
LEFT JOIN public.contacts ct ON ct.id = g.contact_id
ORDER BY g.organization_id, g.contact_id, g.scope_key,
         g.last_message_at DESC NULLS LAST, g.created_at DESC;


-- 1c) CONTATOS duplicados (dois contact_id pro mesmo número na mesma org).
--     Se a migration 20260522210000 não rodou no banco vivo, isso pode existir
--     e também gera chats duplicados. READ-ONLY — só mostra. NÃO rode o bloco
--     DO destrutivo daquela migration (ele é anterior ao escopo por instância
--     e colapsaria chats de números diferentes). Se aparecer coisa aqui, me
--     avise que eu escrevo um merge de contatos instance-aware e seguro.
WITH grupos AS (
  SELECT organization_id, public.whatsapp_phone_match_key(phone) AS phone_key
  FROM public.contacts
  WHERE phone IS NOT NULL AND public.whatsapp_phone_match_key(phone) <> ''
  GROUP BY organization_id, public.whatsapp_phone_match_key(phone)
  HAVING count(*) > 1
)
SELECT
  c.organization_id,
  g.phone_key,
  count(*) AS contatos_no_grupo,
  array_agg(c.id ORDER BY c.updated_at DESC NULLS LAST) AS contact_ids,
  array_agg(DISTINCT c.phone) AS telefones,
  array_agg(DISTINCT NULLIF(c.name, '')) AS nomes
FROM public.contacts c
JOIN grupos g
  ON g.organization_id = c.organization_id
 AND g.phone_key = public.whatsapp_phone_match_key(c.phone)
GROUP BY c.organization_id, g.phone_key
ORDER BY contatos_no_grupo DESC;


-- 1d) Por contato duplicado: quantas conversas/mensagens cada um tem. Ajuda a
--     escolher o keeper e a saber se o merge de contato muda a lista de chats.
WITH grupos AS (
  SELECT organization_id, public.whatsapp_phone_match_key(phone) AS phone_key
  FROM public.contacts
  WHERE phone IS NOT NULL AND public.whatsapp_phone_match_key(phone) <> ''
  GROUP BY organization_id, public.whatsapp_phone_match_key(phone)
  HAVING count(*) > 1
)
SELECT
  public.whatsapp_phone_match_key(c.phone) AS phone_key,
  c.id AS contact_id,
  c.name,
  c.phone,
  (SELECT count(*) FROM public.conversations cv WHERE cv.contact_id = c.id) AS convs,
  (SELECT count(*) FROM public.conversations cv
     WHERE cv.contact_id = c.id AND cv.whatsapp_instance_id IS NOT NULL) AS convs_com_instancia,
  (SELECT count(*) FROM public.messages m
     JOIN public.conversations cv ON cv.id = m.conversation_id
     WHERE cv.contact_id = c.id) AS msgs,
  c.created_at, c.updated_at
FROM public.contacts c
JOIN grupos g
  ON g.organization_id = c.organization_id
 AND g.phone_key = public.whatsapp_phone_match_key(c.phone)
ORDER BY phone_key, convs DESC, msgs DESC;


-- 1e) Contatos com "chat duplicado" do tipo ÓRFÃ + NÚMERO: têm ao mesmo tempo
--     uma conversa órfã (instância NULL) e uma conversa com número real. O merge
--     normal NÃO junta esses (escopos diferentes de propósito) e a adoção de
--     órfã por source_phone não pega quando source_phone é NULL. distinct_instances
--     mostra em quantos números diferentes o contato tem conversa (=1 → merge da
--     órfã no número é seguro; >1 → ambíguo, não mesclar automático).
WITH per_contact AS (
  SELECT contact_id, organization_id,
    count(*) FILTER (WHERE whatsapp_instance_id IS NULL)     AS orfas,
    count(*) FILTER (WHERE whatsapp_instance_id IS NOT NULL) AS com_numero,
    count(DISTINCT whatsapp_instance_id) FILTER (WHERE whatsapp_instance_id IS NOT NULL) AS distinct_instances
  FROM public.conversations
  GROUP BY contact_id, organization_id
)
SELECT ct.name, ct.phone, pc.contact_id, pc.orfas, pc.com_numero, pc.distinct_instances
FROM per_contact pc
JOIN public.contacts ct ON ct.id = pc.contact_id
WHERE pc.orfas >= 1 AND pc.com_numero >= 1
ORDER BY (pc.orfas + pc.com_numero) DESC;


-- ============================================================================
-- PARTE 2 — MERGE (idempotente). Roda tudo numa transação.
--   • Passe _dry_run => true para SÓ CONTAR (não apaga nada).
--   • Passe _dry_run => false para EXECUTAR o merge de fato.
-- A função re-aponta DINAMICAMENTE toda coluna FK que referencia
-- conversations.id, então nenhuma tabela dependente é esquecida.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merge_duplicate_conversations(_dry_run boolean DEFAULT true)
RETURNS TABLE(groups_merged integer, conversations_removed integer, rows_repointed integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grp record;
  _dup record;
  _fk record;
  _keeper uuid;
  _moved bigint;
  _groups integer := 0;
  _removed integer := 0;
  _repointed integer := 0;
BEGIN
  -- Percorre cada grupo de duplicatas (mesmo org+contato+escopo).
  FOR _grp IN
    WITH scoped AS (
      SELECT
        id, organization_id, contact_id,
        last_message_at, created_at,
        CASE
          WHEN whatsapp_instance_id IS NOT NULL
            THEN 'instance:' || whatsapp_instance_id::text
          ELSE 'orphan:' || COALESCE(NULLIF(public.whatsapp_phone_match_key(source_phone), ''), 'sem_numero')
        END AS scope_key
      FROM public.conversations
    )
    SELECT organization_id, contact_id, scope_key
    FROM scoped
    GROUP BY organization_id, contact_id, scope_key
    HAVING count(*) > 1
  LOOP
    _groups := _groups + 1;

    -- Escolhe o keeper: atividade mais recente, depois criação mais recente.
    SELECT id INTO _keeper
    FROM public.conversations c
    WHERE c.organization_id = _grp.organization_id
      AND c.contact_id = _grp.contact_id
      AND (
        CASE
          WHEN c.whatsapp_instance_id IS NOT NULL
            THEN 'instance:' || c.whatsapp_instance_id::text
          ELSE 'orphan:' || COALESCE(NULLIF(public.whatsapp_phone_match_key(c.source_phone), ''), 'sem_numero')
        END
      ) = _grp.scope_key
    ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC NULLS LAST, c.id
    LIMIT 1;

    -- Percorre as duplicatas (todas do grupo menos o keeper).
    FOR _dup IN
      SELECT c.id, c.last_message_at, c.unread_count, c.metadata
      FROM public.conversations c
      WHERE c.organization_id = _grp.organization_id
        AND c.contact_id = _grp.contact_id
        AND (
          CASE
            WHEN c.whatsapp_instance_id IS NOT NULL
              THEN 'instance:' || c.whatsapp_instance_id::text
            ELSE 'orphan:' || COALESCE(NULLIF(public.whatsapp_phone_match_key(c.source_phone), ''), 'sem_numero')
          END
        ) = _grp.scope_key
        AND c.id <> _keeper
    LOOP
      IF _dry_run THEN
        _removed := _removed + 1;
        CONTINUE;
      END IF;

      -- Re-aponta DINAMICAMENTE toda FK single-column que referencia
      -- conversations.id (messages, flow_executions, conversation_origin_audit,
      -- cases, conversation_shares, conversation_pipeline_positions, etc.).
      FOR _fk IN
        SELECT n.nspname AS schema_name, t.relname AS table_name, a.attname AS column_name
        FROM pg_constraint con
        JOIN pg_class t       ON t.oid = con.conrelid
        JOIN pg_namespace n   ON n.oid = t.relnamespace
        JOIN pg_class rt      ON rt.oid = con.confrelid
        JOIN pg_namespace rn  ON rn.oid = rt.relnamespace
        JOIN pg_attribute a   ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
        WHERE con.contype = 'f'
          AND rn.nspname = 'public'
          AND rt.relname = 'conversations'
          AND array_length(con.conkey, 1) = 1
          AND con.confkey[1] = (
            SELECT attnum FROM pg_attribute
            WHERE attrelid = rt.oid AND attname = 'id'
          )
      LOOP
        -- Caminho rápido: move tudo de uma vez.
        BEGIN
          EXECUTE format(
            'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
            _fk.schema_name, _fk.table_name, _fk.column_name, _fk.column_name
          ) USING _keeper, _dup.id;
          GET DIAGNOSTICS _moved = ROW_COUNT;
          _repointed := _repointed + _moved;
        EXCEPTION WHEN unique_violation THEN
          -- Tabela com UNIQUE envolvendo a coluna (ex.: conversation_shares,
          -- conversation_pipeline_positions, messages(conversation_id,zapi_message_id)).
          -- Move linha a linha o que não colide; descarta as redundantes (o
          -- keeper já tem a linha equivalente).
          DECLARE _row record;
          BEGIN
            FOR _row IN EXECUTE format(
              'SELECT ctid FROM %I.%I WHERE %I = $1',
              _fk.schema_name, _fk.table_name, _fk.column_name
            ) USING _dup.id
            LOOP
              BEGIN
                EXECUTE format(
                  'UPDATE %I.%I SET %I = $1 WHERE ctid = $2',
                  _fk.schema_name, _fk.table_name, _fk.column_name
                ) USING _keeper, _row.ctid;
                _repointed := _repointed + 1;
              EXCEPTION WHEN unique_violation THEN
                EXECUTE format('DELETE FROM %I.%I WHERE ctid = $1', _fk.schema_name, _fk.table_name)
                  USING _row.ctid;
              END;
            END LOOP;
          END;
        END;
      END LOOP;

      -- Mescla contadores/atividade/metadata no keeper.
      UPDATE public.conversations k
      SET
        last_message_at = GREATEST(
          COALESCE(k.last_message_at, '-infinity'::timestamptz),
          COALESCE(_dup.last_message_at, '-infinity'::timestamptz)
        ),
        unread_count = COALESCE(k.unread_count, 0) + COALESCE(_dup.unread_count, 0),
        metadata = COALESCE(k.metadata, '{}'::jsonb) || jsonb_build_object(
          'merged_conversation_ids',
          COALESCE(k.metadata->'merged_conversation_ids', '[]'::jsonb) || to_jsonb(_dup.id::text)
        )
      WHERE k.id = _keeper;

      DELETE FROM public.conversations WHERE id = _dup.id;
      _removed := _removed + 1;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT _groups, _removed, _repointed;
END;
$$;

-- 2a) DRY-RUN (não apaga nada — só conta o que seria mesclado):
SELECT * FROM public.merge_duplicate_conversations(true);

-- 2b) EXECUTAR de verdade (descomente para rodar):
-- SELECT * FROM public.merge_duplicate_conversations(false);

-- 2c) Conferência pós-merge — deve voltar VAZIO:
-- WITH grupos AS (
--   SELECT organization_id, contact_id,
--     CASE WHEN whatsapp_instance_id IS NOT NULL THEN 'instance:'||whatsapp_instance_id::text
--          ELSE 'orphan:'||COALESCE(NULLIF(public.whatsapp_phone_match_key(source_phone),''),'sem_numero') END AS scope_key,
--     count(*) qtd
--   FROM public.conversations GROUP BY 1,2,3 HAVING count(*) > 1
-- ) SELECT * FROM grupos;

-- 2d) (Opcional) Depois de validar, remova a função utilitária:
-- DROP FUNCTION IF EXISTS public.merge_duplicate_conversations(boolean);


-- ============================================================================
-- PARTE 3 — MERGE de CONTATOS duplicados (instance-aware, sem perder mensagem).
--   Substitui, de forma SEGURA, o bloco DO da migration 20260522210000 (que é
--   pré-escopo-por-instância e colapsaria chats de números diferentes).
--
--   Diferente do merge antigo: para CADA conversa da duplicata, procura no keeper
--   uma conversa do MESMO escopo (mesma instância; órfãs pelo mesmo source_phone).
--     • Se não existe → só re-aponta o contact_id (nunca cruza instância).
--     • Se existe → funde o par movendo mensagens + FKs (nunca apaga histórico).
--   Depois re-aponta as demais FKs de contact_id e apaga a duplicata.
--
--   ORDEM RECOMENDADA:
--     1) PARTE 3 dry-run (3a) → confira contacts_removed.
--     2) PARTE 3 real (3b).
--     3) PARTE 2 de novo (2b) → limpa órfãs que o merge de contato tenha juntado
--        sob o mesmo contato (idempotente).
--     4) Conferências 1c / 2c → devem voltar vazias.
-- ============================================================================

-- Helper: funde UMA conversa (_src) dentro de outra (_dst). Move todas as FKs
-- single-column que referenciam conversations.id (collision-safe), mescla
-- contadores/metadata e apaga _src. Reutilizável.
CREATE OR REPLACE FUNCTION public._wz_merge_conversation_pair(_src uuid, _dst uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _fk record;
  _row record;
  _src_row record;
BEGIN
  IF _src IS NULL OR _dst IS NULL OR _src = _dst THEN RETURN; END IF;

  FOR _fk IN
    SELECT n.nspname AS schema_name, t.relname AS table_name, a.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class t      ON t.oid = con.conrelid
    JOIN pg_namespace n  ON n.oid = t.relnamespace
    JOIN pg_class rt     ON rt.oid = con.confrelid
    JOIN pg_namespace rn ON rn.oid = rt.relnamespace
    JOIN pg_attribute a  ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND rn.nspname = 'public'
      AND rt.relname = 'conversations'
      AND array_length(con.conkey, 1) = 1
      AND con.confkey[1] = (SELECT attnum FROM pg_attribute WHERE attrelid = rt.oid AND attname = 'id')
  LOOP
    BEGIN
      EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE %I = $2',
        _fk.schema_name, _fk.table_name, _fk.column_name, _fk.column_name) USING _dst, _src;
    EXCEPTION WHEN unique_violation THEN
      FOR _row IN EXECUTE format('SELECT ctid FROM %I.%I WHERE %I = $1',
        _fk.schema_name, _fk.table_name, _fk.column_name) USING _src
      LOOP
        BEGIN
          EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE ctid = $2',
            _fk.schema_name, _fk.table_name, _fk.column_name) USING _dst, _row.ctid;
        EXCEPTION WHEN unique_violation THEN
          EXECUTE format('DELETE FROM %I.%I WHERE ctid = $1', _fk.schema_name, _fk.table_name) USING _row.ctid;
        END;
      END LOOP;
    END;
  END LOOP;

  SELECT * INTO _src_row FROM public.conversations WHERE id = _src;
  UPDATE public.conversations k
  SET
    last_message_at = GREATEST(
      COALESCE(k.last_message_at, '-infinity'::timestamptz),
      COALESCE(_src_row.last_message_at, '-infinity'::timestamptz)
    ),
    unread_count = COALESCE(k.unread_count, 0) + COALESCE(_src_row.unread_count, 0),
    metadata = COALESCE(k.metadata, '{}'::jsonb) || jsonb_build_object(
      'merged_conversation_ids',
      COALESCE(k.metadata->'merged_conversation_ids', '[]'::jsonb) || to_jsonb(_src::text)
    )
  WHERE k.id = _dst;

  DELETE FROM public.conversations WHERE id = _src;
END;
$$;


CREATE OR REPLACE FUNCTION public.merge_duplicate_contacts_safe(_dry_run boolean DEFAULT true)
RETURNS TABLE(groups_merged integer, contacts_removed integer, conversations_merged integer, rows_repointed integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grp record;
  _keeper record;
  _dup record;
  _dup_conv record;
  _keeper_conv_id uuid;
  _scope text;
  _fk record;
  _row record;
  _moved bigint;
  _groups integer := 0;
  _removed integer := 0;
  _convmerged integer := 0;
  _repointed integer := 0;
BEGIN
  FOR _grp IN
    SELECT organization_id, public.whatsapp_phone_match_key(phone) AS phone_key
    FROM public.contacts
    WHERE phone IS NOT NULL AND public.whatsapp_phone_match_key(phone) <> ''
    GROUP BY organization_id, public.whatsapp_phone_match_key(phone)
    HAVING count(*) > 1
  LOOP
    _groups := _groups + 1;

    -- Keeper: mais histórico (msgs, depois conversas), depois DDI 55, depois recência.
    SELECT c.* INTO _keeper
    FROM public.contacts c
    WHERE c.organization_id = _grp.organization_id
      AND public.whatsapp_phone_match_key(c.phone) = _grp.phone_key
    ORDER BY
      (SELECT count(*) FROM public.messages m
         JOIN public.conversations cv ON cv.id = m.conversation_id
         WHERE cv.contact_id = c.id) DESC,
      (SELECT count(*) FROM public.conversations cv WHERE cv.contact_id = c.id) DESC,
      (regexp_replace(c.phone, '\D', '', 'g') LIKE '55%') DESC,
      c.updated_at DESC NULLS LAST, c.created_at DESC NULLS LAST, c.id
    LIMIT 1;

    FOR _dup IN
      SELECT c.* FROM public.contacts c
      WHERE c.organization_id = _grp.organization_id
        AND public.whatsapp_phone_match_key(c.phone) = _grp.phone_key
        AND c.id <> _keeper.id
    LOOP
      IF _dry_run THEN
        _removed := _removed + 1;
        CONTINUE;
      END IF;

      -- A) Conversas: move para o keeper por ESCOPO, fundindo se já existir.
      FOR _dup_conv IN
        SELECT * FROM public.conversations WHERE contact_id = _dup.id
      LOOP
        _scope := CASE
          WHEN _dup_conv.whatsapp_instance_id IS NOT NULL
            THEN 'instance:' || _dup_conv.whatsapp_instance_id::text
          ELSE 'orphan:' || COALESCE(NULLIF(public.whatsapp_phone_match_key(_dup_conv.source_phone), ''), 'sem_numero')
        END;

        SELECT cv.id INTO _keeper_conv_id
        FROM public.conversations cv
        WHERE cv.contact_id = _keeper.id
          AND cv.organization_id = _grp.organization_id
          AND (CASE
                 WHEN cv.whatsapp_instance_id IS NOT NULL
                   THEN 'instance:' || cv.whatsapp_instance_id::text
                 ELSE 'orphan:' || COALESCE(NULLIF(public.whatsapp_phone_match_key(cv.source_phone), ''), 'sem_numero')
               END) = _scope
        ORDER BY cv.last_message_at DESC NULLS LAST, cv.created_at DESC NULLS LAST
        LIMIT 1;

        IF _keeper_conv_id IS NULL THEN
          UPDATE public.conversations SET contact_id = _keeper.id WHERE id = _dup_conv.id;
        ELSIF _keeper_conv_id <> _dup_conv.id THEN
          PERFORM public._wz_merge_conversation_pair(_dup_conv.id, _keeper_conv_id);
          _convmerged := _convmerged + 1;
        END IF;
      END LOOP;

      -- B) Demais FKs de contact_id (exceto conversations, já tratado). Collision-safe.
      FOR _fk IN
        SELECT n.nspname AS schema_name, t.relname AS table_name, a.attname AS column_name
        FROM pg_constraint con
        JOIN pg_class t      ON t.oid = con.conrelid
        JOIN pg_namespace n  ON n.oid = t.relnamespace
        JOIN pg_class rt     ON rt.oid = con.confrelid
        JOIN pg_namespace rn ON rn.oid = rt.relnamespace
        JOIN pg_attribute a  ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
        WHERE con.contype = 'f'
          AND rn.nspname = 'public'
          AND rt.relname = 'contacts'
          AND t.relname <> 'conversations'
          AND array_length(con.conkey, 1) = 1
          AND con.confkey[1] = (SELECT attnum FROM pg_attribute WHERE attrelid = rt.oid AND attname = 'id')
      LOOP
        BEGIN
          EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE %I = $2',
            _fk.schema_name, _fk.table_name, _fk.column_name, _fk.column_name) USING _keeper.id, _dup.id;
          GET DIAGNOSTICS _moved = ROW_COUNT;
          _repointed := _repointed + _moved;
        EXCEPTION WHEN unique_violation THEN
          FOR _row IN EXECUTE format('SELECT ctid FROM %I.%I WHERE %I = $1',
            _fk.schema_name, _fk.table_name, _fk.column_name) USING _dup.id
          LOOP
            BEGIN
              EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE ctid = $2',
                _fk.schema_name, _fk.table_name, _fk.column_name) USING _keeper.id, _row.ctid;
              _repointed := _repointed + 1;
            EXCEPTION WHEN unique_violation THEN
              EXECUTE format('DELETE FROM %I.%I WHERE ctid = $1', _fk.schema_name, _fk.table_name) USING _row.ctid;
            END;
          END LOOP;
        END;
      END LOOP;

      -- C) Preenche campos vazios do keeper e registra aliases/merge no metadata.
      UPDATE public.contacts k
      SET
        name = COALESCE(NULLIF(k.name, ''), _dup.name),
        email = COALESCE(NULLIF(k.email, ''), _dup.email),
        avatar_url = COALESCE(NULLIF(k.avatar_url, ''), _dup.avatar_url),
        metadata = COALESCE(k.metadata, '{}'::jsonb) || jsonb_build_object(
          'merged_contact_ids',
          COALESCE(k.metadata->'merged_contact_ids', '[]'::jsonb) || to_jsonb(_dup.id::text),
          'canonical_phone', regexp_replace(k.phone, '\D', '', 'g'),
          'phone_aliases', (
            SELECT COALESCE(jsonb_agg(DISTINCT v), '[]'::jsonb)
            FROM jsonb_array_elements_text(
              COALESCE(k.metadata->'phone_aliases', '[]'::jsonb)
              || COALESCE(_dup.metadata->'phone_aliases', '[]'::jsonb)
              || to_jsonb(ARRAY[k.phone, _dup.phone])
            ) AS v
            WHERE v IS NOT NULL AND v <> ''
          )
        ),
        updated_at = now()
      WHERE k.id = _keeper.id;

      -- D) Remove a duplicata.
      DELETE FROM public.contacts WHERE id = _dup.id;
      _removed := _removed + 1;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT _groups, _removed, _convmerged, _repointed;
END;
$$;

-- 3a) DRY-RUN de contatos (não apaga nada — conta grupos e duplicatas):
SELECT * FROM public.merge_duplicate_contacts_safe(true);

-- 3b) EXECUTAR de verdade (descomente):
-- SELECT * FROM public.merge_duplicate_contacts_safe(false);

-- 3c) Depois de 3b, rode a PARTE 2 de novo para limpar órfãs juntadas sob o
--     mesmo contato:
-- SELECT * FROM public.merge_duplicate_conversations(false);

-- 3d) Conferência: 1c deve voltar VAZIO (sem contatos duplicados).

-- 3e) (Opcional) Remova as funções utilitárias após validar tudo:
-- DROP FUNCTION IF EXISTS public.merge_duplicate_contacts_safe(boolean);
-- DROP FUNCTION IF EXISTS public._wz_merge_conversation_pair(uuid, uuid);


-- ============================================================================
-- PARTE 4 — Une a conversa ÓRFÃ (instância NULL) à conversa do NÚMERO, para o
--   mesmo contato. É o caso do "Lucas com 2 chats": uma conversa sem número +
--   uma com número. O merge normal não junta (escopos diferentes) e a adoção
--   por source_phone não pega quando source_phone é NULL.
--
--   SEGURANÇA: só age em contatos com distinct_instances = 1 (um único número).
--   Contatos com 2+ números + órfã são AMBÍGUOS (não dá pra saber em qual número
--   a órfã entra) → PULADOS e reportados em contacts_skipped_multi. Veja-os na
--   query 4c para decidir manualmente.
--
--   Keeper = a conversa do número (a "viva"). A órfã é fundida nela via
--   _wz_merge_conversation_pair (move mensagens/FKs, nada é perdido).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merge_orphans_into_number(_dry_run boolean DEFAULT true)
RETURNS TABLE(contacts_affected integer, orphans_merged integer, contacts_skipped_multi integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _c record;
  _keeper_conv uuid;
  _orphan record;
  _affected integer := 0;
  _merged integer := 0;
  _skipped integer := 0;
BEGIN
  FOR _c IN
    WITH per_contact AS (
      SELECT contact_id, organization_id,
        count(*) FILTER (WHERE whatsapp_instance_id IS NULL)     AS orfas,
        count(*) FILTER (WHERE whatsapp_instance_id IS NOT NULL) AS com_numero,
        count(DISTINCT whatsapp_instance_id) FILTER (WHERE whatsapp_instance_id IS NOT NULL) AS di
      FROM public.conversations
      GROUP BY contact_id, organization_id
    )
    SELECT contact_id, organization_id, di
    FROM per_contact
    WHERE orfas >= 1 AND com_numero >= 1
  LOOP
    IF _c.di <> 1 THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    _affected := _affected + 1;
    IF _dry_run THEN CONTINUE; END IF;

    -- Keeper = a conversa do número (única, pois distinct_instances = 1).
    SELECT id INTO _keeper_conv
    FROM public.conversations
    WHERE contact_id = _c.contact_id
      AND organization_id = _c.organization_id
      AND whatsapp_instance_id IS NOT NULL
    ORDER BY last_message_at DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT 1;

    IF _keeper_conv IS NULL THEN
      _affected := _affected - 1;
      CONTINUE;
    END IF;

    FOR _orphan IN
      SELECT id
      FROM public.conversations
      WHERE contact_id = _c.contact_id
        AND organization_id = _c.organization_id
        AND whatsapp_instance_id IS NULL
    LOOP
      PERFORM public._wz_merge_conversation_pair(_orphan.id, _keeper_conv);
      _merged := _merged + 1;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT _affected, _merged, _skipped;
END;
$$;

-- 4a) DRY-RUN (conta contatos que seriam unidos e quantos ficam pra decisão manual):
SELECT * FROM public.merge_orphans_into_number(true);

-- 4b) EXECUTAR de verdade (descomente):
-- SELECT * FROM public.merge_orphans_into_number(false);

-- 4c) Casos AMBÍGUOS (2+ números + órfã) — decida manualmente. Mostra cada
--     conversa do contato com número/instância/mensagens.
WITH per_contact AS (
  SELECT contact_id, organization_id,
    count(*) FILTER (WHERE whatsapp_instance_id IS NULL)     AS orfas,
    count(DISTINCT whatsapp_instance_id) FILTER (WHERE whatsapp_instance_id IS NOT NULL) AS di
  FROM public.conversations GROUP BY contact_id, organization_id
),
ambiguos AS (
  SELECT contact_id FROM per_contact WHERE orfas >= 1 AND di >= 2
)
SELECT
  ct.name, ct.phone,
  cv.id AS conversation_id,
  cv.whatsapp_instance_id,
  wi.phone_number AS numero_instancia,
  cv.source_phone,
  cv.last_message_at,
  (SELECT count(*) FROM public.messages m WHERE m.conversation_id = cv.id) AS msgs
FROM public.conversations cv
JOIN ambiguos a ON a.contact_id = cv.contact_id
LEFT JOIN public.contacts ct           ON ct.id = cv.contact_id
LEFT JOIN public.whatsapp_instances wi ON wi.id = cv.whatsapp_instance_id
ORDER BY ct.name, cv.whatsapp_instance_id NULLS FIRST, cv.last_message_at DESC NULLS LAST;

-- 4d) Conferência final: 1e deve mostrar só os casos ambíguos (di >= 2) que você
--     ainda não decidiu; tudo com di = 1 deve ter sumido.

-- 4e) (Opcional) manter as funções ajuda em limpezas futuras; para remover:
-- DROP FUNCTION IF EXISTS public.merge_orphans_into_number(boolean);
