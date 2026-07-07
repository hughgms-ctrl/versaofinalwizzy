-- ============================================================================
-- FASE 1 — EXECUÇÃO: coluna hidden_by_disconnect + readoção + trigger.
-- ----------------------------------------------------------------------------
-- Modelo (confirmado): conversa SEM instância viva = número desconectado =
-- ESCONDIDA. Com instância = visível. Delete da instância zera whatsapp_instance_id
-- (FK ON DELETE SET NULL) → esconde; reconnect readota → reaparece; queda de rede
-- NÃO zera a instância → não pisca.
--
-- Este script NÃO liga o filtro ainda (isso é a Fase 2 / RLS). Ele só:
--   1) cria a coluna, 2) corrige source_phone corrompido, 3) READOTA as órfãs que
--   pertencem a número conectado (por source_phone ou por workspace), 4) marca as
--   restantes como escondidas, 5) cria o trigger que mantém tudo em sincronia.
--
-- >>> Rode PASSO A PASSO. O PASSO 3 tem dry-run antes do real. <<<
-- Aplicação: MANUAL no SQL Editor do Supabase (regra de deploy Lovable).
-- ============================================================================

-- ---- Pré-requisitos (idempotente; re-declara p/ ser auto-contido) ----------
CREATE OR REPLACE FUNCTION public.whatsapp_phone_match_key(raw_phone text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  WITH clean AS (SELECT regexp_replace(coalesce(raw_phone,''),'\D','','g') AS digits),
  no_country AS (
    SELECT CASE WHEN digits LIKE '55%' AND length(digits) >= 12 THEN substr(digits,3) ELSE digits END AS local_digits FROM clean
  )
  SELECT CASE WHEN length(local_digits)=11 AND substr(local_digits,3,1)='9'
    THEN substr(local_digits,1,2)||substr(local_digits,4) ELSE local_digits END FROM no_country;
$$;

-- Funde uma conversa (_src) em outra (_dst): move todas as FKs (collision-safe),
-- mescla contadores/metadata e apaga _src. (mesma do cleanup de duplicadas)
CREATE OR REPLACE FUNCTION public._wz_merge_conversation_pair(_src uuid, _dst uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _fk record; _row record; _src_row record;
BEGIN
  IF _src IS NULL OR _dst IS NULL OR _src = _dst THEN RETURN; END IF;
  FOR _fk IN
    SELECT n.nspname AS schema_name, t.relname AS table_name, a.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class t ON t.oid=con.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_class rt ON rt.oid=con.confrelid JOIN pg_namespace rn ON rn.oid=rt.relnamespace
    JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=con.conkey[1]
    WHERE con.contype='f' AND rn.nspname='public' AND rt.relname='conversations'
      AND array_length(con.conkey,1)=1
      AND con.confkey[1]=(SELECT attnum FROM pg_attribute WHERE attrelid=rt.oid AND attname='id')
  LOOP
    BEGIN
      EXECUTE format('UPDATE %I.%I SET %I=$1 WHERE %I=$2',_fk.schema_name,_fk.table_name,_fk.column_name,_fk.column_name) USING _dst,_src;
    EXCEPTION WHEN unique_violation THEN
      FOR _row IN EXECUTE format('SELECT ctid FROM %I.%I WHERE %I=$1',_fk.schema_name,_fk.table_name,_fk.column_name) USING _src LOOP
        BEGIN EXECUTE format('UPDATE %I.%I SET %I=$1 WHERE ctid=$2',_fk.schema_name,_fk.table_name,_fk.column_name) USING _dst,_row.ctid;
        EXCEPTION WHEN unique_violation THEN EXECUTE format('DELETE FROM %I.%I WHERE ctid=$1',_fk.schema_name,_fk.table_name) USING _row.ctid; END;
      END LOOP;
    END;
  END LOOP;
  SELECT * INTO _src_row FROM public.conversations WHERE id=_src;
  UPDATE public.conversations k SET
    last_message_at=GREATEST(COALESCE(k.last_message_at,'-infinity'::timestamptz),COALESCE(_src_row.last_message_at,'-infinity'::timestamptz)),
    unread_count=COALESCE(k.unread_count,0)+COALESCE(_src_row.unread_count,0),
    metadata=COALESCE(k.metadata,'{}'::jsonb)||jsonb_build_object('merged_conversation_ids',COALESCE(k.metadata->'merged_conversation_ids','[]'::jsonb)||to_jsonb(_src::text))
  WHERE k.id=_dst;
  DELETE FROM public.conversations WHERE id=_src;
END; $$;


-- ---- PASSO 1 — coluna + índice de visibilidade -----------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS hidden_by_disconnect boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_conversations_visible
  ON public.conversations (organization_id)
  WHERE hidden_by_disconnect = false;


-- ---- PASSO 2 — corrige source_phone corrompido (dígito extra no fim) --------
-- Ex.: Natã tinha source_phone '55279925470932' = número do comercial
-- '5527992547093' + '2'. Normaliza para o número da instância conectada quando o
-- source_phone é exatamente "número da instância + 1-2 dígitos a mais".
UPDATE public.conversations cv
SET source_phone = wi.phone_number
FROM public.whatsapp_instances wi
WHERE cv.whatsapp_instance_id IS NULL
  AND wi.organization_id = cv.organization_id
  AND wi.status = 'connected' AND wi.phone_number IS NOT NULL
  AND cv.source_phone IS NOT NULL
  AND regexp_replace(cv.source_phone,'\D','','g') LIKE regexp_replace(wi.phone_number,'\D','','g') || '%'
  AND length(regexp_replace(cv.source_phone,'\D','','g')) - length(regexp_replace(wi.phone_number,'\D','','g')) BETWEEN 1 AND 2;


-- ---- PASSO 3 — READOÇÃO das órfãs que pertencem a número conectado ----------
-- Alvo por (1) source_phone que casa com instância conectada, ou (2) workspace
-- ligado a instância conectada. Se o contato já tem conversa naquela instância,
-- FUNDE (move mensagens); senão, só carimba a instância. Sem alvo → fica órfã
-- (será escondida no PASSO 4). _dry_run=true só conta.
CREATE OR REPLACE FUNCTION public.readopt_orphan_conversations(_dry_run boolean DEFAULT true)
RETURNS TABLE(readopted integer, merged integer, still_hidden integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _o record; _target uuid; _existing uuid;
  _readopted integer := 0; _merged integer := 0; _hidden integer := 0;
BEGIN
  FOR _o IN
    SELECT cv.id, cv.organization_id, cv.contact_id, cv.workspace_id, cv.source_phone
    FROM public.conversations cv
    WHERE cv.whatsapp_instance_id IS NULL
  LOOP
    _target := NULL;

    -- (1) por source_phone
    IF _o.source_phone IS NOT NULL AND public.whatsapp_phone_match_key(_o.source_phone) <> '' THEN
      SELECT wi.id INTO _target
      FROM public.whatsapp_instances wi
      WHERE wi.organization_id = _o.organization_id
        AND wi.status = 'connected' AND wi.phone_number IS NOT NULL
        AND public.whatsapp_phone_match_key(wi.phone_number) = public.whatsapp_phone_match_key(_o.source_phone)
      ORDER BY wi.connected_at DESC NULLS LAST LIMIT 1;
    END IF;

    -- (2) por workspace ligado a instância conectada
    IF _target IS NULL AND _o.workspace_id IS NOT NULL THEN
      SELECT wi.id INTO _target
      FROM public.workspaces w
      JOIN public.whatsapp_instances wi ON wi.id = w.whatsapp_instance_id
      WHERE w.id = _o.workspace_id AND wi.status = 'connected'
      LIMIT 1;
    END IF;

    IF _target IS NULL THEN
      _hidden := _hidden + 1;
      CONTINUE;
    END IF;

    IF _dry_run THEN
      _readopted := _readopted + 1;
      CONTINUE;
    END IF;

    -- Já existe conversa desse contato na instância alvo?
    SELECT cv.id INTO _existing
    FROM public.conversations cv
    WHERE cv.contact_id = _o.contact_id
      AND cv.organization_id = _o.organization_id
      AND cv.whatsapp_instance_id = _target
      AND cv.id <> _o.id
    ORDER BY cv.last_message_at DESC NULLS LAST, cv.created_at DESC NULLS LAST
    LIMIT 1;

    IF _existing IS NOT NULL THEN
      PERFORM public._wz_merge_conversation_pair(_o.id, _existing);
      _merged := _merged + 1;
    ELSE
      UPDATE public.conversations
      SET whatsapp_instance_id = _target,
          source_phone = COALESCE(source_phone, (SELECT phone_number FROM public.whatsapp_instances WHERE id = _target))
      WHERE id = _o.id;
      _readopted := _readopted + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT _readopted, _merged, _hidden;
END; $$;

-- 3a) DRY-RUN (não altera nada — conta readopted / still_hidden):
SELECT * FROM public.readopt_orphan_conversations(true);

-- 3b) EXECUTAR (descomente):
-- SELECT * FROM public.readopt_orphan_conversations(false);


-- ---- PASSO 4 — marca escondidas as que continuam sem instância -------------
-- (rode só DEPOIS do 3b)
-- UPDATE public.conversations
-- SET hidden_by_disconnect = (whatsapp_instance_id IS NULL);


-- ---- PASSO 5 — trigger que mantém hidden em sincronia com a instância -------
-- hidden = (whatsapp_instance_id IS NULL). Pega o delete (FK SET NULL dispara
-- UPDATE), a readoção (carimba instância) e conversas novas.
CREATE OR REPLACE FUNCTION public.sync_conversation_hidden_flag()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.hidden_by_disconnect := (NEW.whatsapp_instance_id IS NULL);
  RETURN NEW;
END; $$;

-- DROP TRIGGER IF EXISTS trg_sync_conversation_hidden ON public.conversations;
-- CREATE TRIGGER trg_sync_conversation_hidden
--   BEFORE INSERT OR UPDATE OF whatsapp_instance_id ON public.conversations
--   FOR EACH ROW EXECUTE FUNCTION public.sync_conversation_hidden_flag();


-- ---- PASSO 6 — VERIFICAÇÃO (rode ao final) ---------------------------------
-- Quantas visíveis x escondidas por org (confira que bate com o esperado:
-- principal ~8 escondidas, teste 0, a0a518a0 10).
-- SELECT organization_id,
--   count(*) FILTER (WHERE hidden_by_disconnect) AS escondidas,
--   count(*) FILTER (WHERE NOT hidden_by_disconnect) AS visiveis
-- FROM public.conversations GROUP BY organization_id ORDER BY escondidas DESC;
