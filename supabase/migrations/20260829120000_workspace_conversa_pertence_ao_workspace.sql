-- ============================================================================
-- Conversa pertence ao WORKSPACE (não ao número) — spec docs/WORKSPACE_REGRAS_SPEC.md
--
-- Inverte a filosofia da 20260818120000 ("conversa pertence ao número").
-- Decisão do dono do produto em 2026-08-28:
--   R1  conversa pertence ao workspace; trocar o número de workspace não move nada.
--   R2  transferência é explícita (seletor na conversa) e leva o histórico.
--   R3  número em >=2 workspaces exige regra de roteamento (só para contato novo).
--   R5  "último workspace a enviar é o dono": toda mensagem recebida cai no
--       workspace dono do (contato, número); qualquer envio (humano, IA, fluxo,
--       campanha, agendado) ou transferência muda o dono.
--   R7  reconexão do mesmo número = mesma conversa (a linha de whatsapp_instances
--       é reaproveitada na reconexão, então a chave é o id da instância).
--
-- O que muda aqui:
--   1) guard "workspace = número" DESLIGADO (a função fica, só checa org);
--   2) identidade da conversa passa a incluir o workspace;
--   3) roteamento por instância (routing_mode / routing_config);
--   4) tabela contact_number_owners (dono por contato+número) + triggers que
--      reivindicam o dono em todo envio e em toda transferência;
--   5) wz_route_incoming_conversation(): o webhook pergunta "em qual workspace
--      cai esta mensagem?";
--   6) backfill dos donos a partir da última mensagem enviada.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Guard desligado. A função continua existindo (triggers auto_assign_* a
--    chamam) mas passa a impor só "workspace é da mesma org".
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_guard_conversation_workspace_number ON public.conversations;

CREATE OR REPLACE FUNCTION public.wz_workspace_allowed_for_conversation(
  _workspace_id    uuid,
  _organization_id uuid,
  _instance_id     uuid,
  _source_phone    text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _workspace_id IS NULL OR EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = _workspace_id AND w.organization_id = _organization_id
  );
$$;

COMMENT ON FUNCTION public.wz_workspace_allowed_for_conversation(uuid, uuid, uuid, text) IS
  'Desde 2026-08-29 a conversa pertence ao workspace, não ao número: só exige que o workspace seja da mesma org.';


-- ----------------------------------------------------------------------------
-- 2) Identidade da conversa = (contato, org, instância, workspace).
--    O índice antigo (sem workspace) impedia o workspace A abrir chat novo com
--    um contato que já tinha chat no B pelo mesmo número.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_conversations_contact_org_instance_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_contact_org_instance_ws_unique
  ON public.conversations (
    contact_id,
    organization_id,
    whatsapp_instance_id,
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE whatsapp_instance_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 3) Roteamento por número (só importa quando >=2 workspaces apontam para ele).
--    routing_config:
--      single      -> {"primary_workspace_id": "<uuid>"}
--      round_robin -> {}
--      percentage  -> {"weights": {"<ws uuid>": 70, "<ws uuid>": 30}}
-- ----------------------------------------------------------------------------
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS routing_mode   text    NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS routing_config jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS routing_cursor integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_routing_mode_check
    CHECK (routing_mode IN ('single', 'round_robin', 'percentage'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ----------------------------------------------------------------------------
-- 4) Dono do contato por número.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_number_owners (
  contact_id           uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  whatsapp_instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  organization_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id         uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  claimed_by           text NOT NULL DEFAULT 'send',   -- send | transfer | routing | backfill
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, whatsapp_instance_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_number_owners_workspace
  ON public.contact_number_owners (workspace_id);

ALTER TABLE public.contact_number_owners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view contact owners in their organization" ON public.contact_number_owners;
CREATE POLICY "Users can view contact owners in their organization"
  ON public.contact_number_owners FOR SELECT
  USING (organization_id = public.get_user_org_id((select auth.uid())));
-- Escrita só pelo backend / triggers (SECURITY DEFINER).

CREATE OR REPLACE FUNCTION public.wz_claim_contact_owner(
  _contact_id   uuid,
  _instance_id  uuid,
  _workspace_id uuid,
  _source       text DEFAULT 'send'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org uuid;
BEGIN
  IF _contact_id IS NULL OR _instance_id IS NULL OR _workspace_id IS NULL THEN
    RETURN;
  END IF;

  SELECT organization_id INTO _org FROM public.workspaces WHERE id = _workspace_id;
  IF _org IS NULL THEN RETURN; END IF;

  INSERT INTO public.contact_number_owners AS o
    (contact_id, whatsapp_instance_id, organization_id, workspace_id, claimed_by, updated_at)
  VALUES (_contact_id, _instance_id, _org, _workspace_id, _source, now())
  ON CONFLICT (contact_id, whatsapp_instance_id) DO UPDATE
    SET workspace_id = EXCLUDED.workspace_id,
        claimed_by   = EXCLUDED.claimed_by,
        updated_at   = now()
    WHERE o.workspace_id IS DISTINCT FROM EXCLUDED.workspace_id;
END;
$$;

-- 4a) Todo envio reivindica o dono (humano, IA, fluxo, campanha, agendado:
--     todos inserem em messages com direction = 'outbound').
CREATE OR REPLACE FUNCTION public.trg_claim_owner_on_outbound_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _c record;
BEGIN
  IF NEW.direction <> 'outbound' THEN RETURN NEW; END IF;

  SELECT contact_id, whatsapp_instance_id, workspace_id
  INTO _c FROM public.conversations WHERE id = NEW.conversation_id;

  IF _c.workspace_id IS NOT NULL AND _c.whatsapp_instance_id IS NOT NULL THEN
    PERFORM public.wz_claim_contact_owner(_c.contact_id, _c.whatsapp_instance_id, _c.workspace_id, 'send');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_owner_on_outbound_message ON public.messages;
CREATE TRIGGER trg_claim_owner_on_outbound_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_claim_owner_on_outbound_message();

-- 4b) Transferir a conversa (workspace_id muda) reivindica o dono para o destino.
CREATE OR REPLACE FUNCTION public.trg_claim_owner_on_conversation_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.workspace_id IS NOT NULL
     AND NEW.whatsapp_instance_id IS NOT NULL
     AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    PERFORM public.wz_claim_contact_owner(NEW.contact_id, NEW.whatsapp_instance_id, NEW.workspace_id, 'transfer');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_owner_on_conversation_transfer ON public.conversations;
CREATE TRIGGER trg_claim_owner_on_conversation_transfer
  AFTER UPDATE OF workspace_id ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.trg_claim_owner_on_conversation_transfer();


-- ----------------------------------------------------------------------------
-- 5) Em qual workspace cai a mensagem que chegou por esta instância?
--    dono vigente (se ainda atende o número) -> senão roteamento (R3) -> NULL se
--    o número não tem workspace nenhum (não deveria acontecer: R4).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wz_route_incoming_conversation(
  _contact_id      uuid,
  _organization_id uuid,
  _instance_id     uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_ws uuid;
  _linked   uuid[];
  _n        integer;
  _mode     text;
  _config   jsonb;
  _cursor   integer;
  _chosen   uuid;
  _total    numeric;
  _r        numeric;
  _acc      numeric;
  _ws       uuid;
  _w        numeric;
BEGIN
  IF _instance_id IS NULL THEN RETURN NULL; END IF;

  SELECT array_agg(w.id ORDER BY w.created_at, w.id)
  INTO _linked
  FROM public.workspaces w
  WHERE w.organization_id = _organization_id
    AND w.whatsapp_instance_id = _instance_id
    AND w.is_active = true;

  _n := COALESCE(array_length(_linked, 1), 0);
  IF _n = 0 THEN RETURN NULL; END IF;

  -- R5: dono vigente, desde que ainda atenda este número.
  SELECT o.workspace_id INTO _owner_ws
  FROM public.contact_number_owners o
  WHERE o.contact_id = _contact_id AND o.whatsapp_instance_id = _instance_id;

  IF _owner_ws IS NOT NULL AND _owner_ws = ANY(_linked) THEN
    RETURN _owner_ws;
  END IF;

  -- Contato novo neste número (ou dono que deixou de atender o número).
  IF _n = 1 THEN
    _chosen := _linked[1];
  ELSE
    SELECT routing_mode, routing_config, routing_cursor
    INTO _mode, _config, _cursor
    FROM public.whatsapp_instances WHERE id = _instance_id;

    IF _mode = 'round_robin' THEN
      _chosen := _linked[(_cursor % _n) + 1];
      UPDATE public.whatsapp_instances SET routing_cursor = _cursor + 1 WHERE id = _instance_id;

    ELSIF _mode = 'percentage' THEN
      _total := 0;
      FOREACH _ws IN ARRAY _linked LOOP
        _total := _total + COALESCE((_config->'weights'->>(_ws::text))::numeric, 0);
      END LOOP;
      IF _total <= 0 THEN
        _chosen := _linked[1];
      ELSE
        _r := random() * _total;
        _acc := 0;
        FOREACH _ws IN ARRAY _linked LOOP
          _w := COALESCE((_config->'weights'->>(_ws::text))::numeric, 0);
          _acc := _acc + _w;
          IF _chosen IS NULL AND _w > 0 AND _r < _acc THEN _chosen := _ws; END IF;
        END LOOP;
        IF _chosen IS NULL THEN _chosen := _linked[_n]; END IF;
      END IF;

    ELSE -- 'single'
      _chosen := NULLIF(_config->>'primary_workspace_id', '')::uuid;
      IF _chosen IS NULL OR NOT (_chosen = ANY(_linked)) THEN _chosen := _linked[1]; END IF;
    END IF;
  END IF;

  PERFORM public.wz_claim_contact_owner(_contact_id, _instance_id, _chosen, 'routing');
  RETURN _chosen;
END;
$$;

REVOKE ALL ON FUNCTION public.wz_route_incoming_conversation(uuid, uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.wz_claim_contact_owner(uuid, uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wz_route_incoming_conversation(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wz_claim_contact_owner(uuid, uuid, uuid, text) TO service_role;


-- ----------------------------------------------------------------------------
-- 6) Backfill: dono = workspace da conversa com a ÚLTIMA mensagem enviada por
--    (contato, instância); sem envio, a conversa mais recente com workspace.
--    Não move conversa nenhuma.
-- ----------------------------------------------------------------------------
INSERT INTO public.contact_number_owners
  (contact_id, whatsapp_instance_id, organization_id, workspace_id, claimed_by)
SELECT DISTINCT ON (c.contact_id, c.whatsapp_instance_id)
  c.contact_id, c.whatsapp_instance_id, c.organization_id, c.workspace_id, 'backfill'
FROM public.conversations c
LEFT JOIN LATERAL (
  SELECT max(m.created_at) AS last_out
  FROM public.messages m
  WHERE m.conversation_id = c.id AND m.direction = 'outbound'
) lo ON true
WHERE c.whatsapp_instance_id IS NOT NULL
  AND c.workspace_id IS NOT NULL
ORDER BY c.contact_id, c.whatsapp_instance_id,
         lo.last_out DESC NULLS LAST, c.last_message_at DESC NULLS LAST, c.created_at DESC
ON CONFLICT DO NOTHING;
