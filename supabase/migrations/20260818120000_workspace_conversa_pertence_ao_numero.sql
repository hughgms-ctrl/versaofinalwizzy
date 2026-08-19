-- ============================================================================
-- Conversa pertence ao WORKSPACE DO SEU NÚMERO (invariante, não remendo)
--
-- SINTOMA (2026-08-18): org com "Comercial" e "Comercial 2". Algumas conversas
-- do Comercial passaram a aparecer no Comercial 2, e no Comercial 2 apareceram
-- conversas de um número que nem está mais conectado.
--
-- CAUSA: seis caminhos escrevem conversations.workspace_id e nenhum deles olhava
-- o NÚMERO da conversa:
--   1) auto_assign_workspace()        — trigger em conversations (por tag)
--   2) auto_assign_workspace_on_tag() — trigger em contact_tags
--   3) zapi-webhook  (gatilho de campanha)
--   4) campaign-webhook
--   5) flow-execute  (nó action-workspace)
--   6) safe-record-actions (mover contatos em massa)
-- Os dois triggers escolhiam o workspace com `LIMIT 1` SEM `ORDER BY` e sem
-- checar `is_active`: com uma tag em comum entre dois workspaces, o destino era
-- sorteio. Pior, o trigger de tag carimbava TODAS as conversas do contato ainda
-- sem workspace — inclusive a do número velho, desconectado. Daí "não são todas,
-- só algumas": só as que passaram por um desses gatilhos depois.
--
-- REGRA (confirmada com o usuário): workspace = número. Uma conversa só pode ser
-- carimbada automaticamente com um workspace que seja dono do número dela.
--
-- ESTRATÉGIA: em vez de remendar os seis caminhos, a regra vira uma função só
-- (`wz_workspace_allowed_for_conversation`) usada pelos triggers, mais uma
-- GUARDA em conversations que barra o carimbo inequivocamente errado venha ele
-- de onde vier (campanha, fluxo, mover em massa, SQL manual).
--
-- COMPATIBILIDADE: orgs que não vinculam número a workspace (a maioria) não
-- mudam de comportamento — quando o número da conversa não tem workspace dono,
-- a regra antiga por tag continua valendo. A regra só "liga" onde há dono.
--
-- LIMITE CONHECIDO (diagnóstico de 2026-08-18): o app permite vincular DOIS
-- workspaces ativos ao MESMO número — é exatamente a configuração da org do caso
-- ("Comercial" e "Comercial 2" apontam para a mesma instância). Quando isso
-- acontece, esta guarda não tem como arbitrar entre os dois: os dois atendem o
-- mesmo número, os dois passam. O que impede o vaza-vaga nesse cenário é a outra
-- metade da correção, no código: nenhum caminho automático MOVE conversa que já
-- tem workspace (zapi-webhook e campaign-webhook), só preenche vazio. A guarda
-- cobre o cruzamento entre números DIFERENTES — que nesta org também existe
-- (workspace "Hewerton" tem número próprio).
--
-- Esta migration NÃO move dados. O saneamento das conversas já carimbadas errado
-- é manual e com dry-run: docs/sanear-conversas-workspace-errado.sql
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Número da CONVERSA (chave de comparação tolerante a DDI/9º dígito).
--    Preferência: número da instância viva; se a instância foi deletada
--    (órfã), cai no source_phone, que é justamente o que sobrevive ao churn.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wz_conversation_phone_key(
  _instance_id uuid,
  _source_phone text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(public.whatsapp_phone_match_key(
      (SELECT wi.phone_number FROM public.whatsapp_instances wi WHERE wi.id = _instance_id)
    ), ''),
    NULLIF(public.whatsapp_phone_match_key(_source_phone), '')
  );
$$;

COMMENT ON FUNCTION public.wz_conversation_phone_key(uuid, text) IS
  'Número (match key) ao qual a conversa pertence: o da instância, ou o source_phone quando a instância já não existe.';


-- ----------------------------------------------------------------------------
-- 2) Número do WORKSPACE. NULL = workspace sem número vinculado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wz_workspace_phone_key(_workspace_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(public.whatsapp_phone_match_key(wi.phone_number), '')
  FROM public.workspaces w
  LEFT JOIN public.whatsapp_instances wi ON wi.id = w.whatsapp_instance_id
  WHERE w.id = _workspace_id;
$$;


-- ----------------------------------------------------------------------------
-- 3) A REGRA. Este workspace pode receber esta conversa?
--
--    (a) números conhecidos dos dois lados e DIFERENTES  → NÃO (inequívoco)
--    (b) o número da conversa já tem workspace(s) dono(s) → só eles podem
--    (c) número da conversa sem dono na org               → liberado (legado
--        por tag continua funcionando em quem não usa vínculo por número)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wz_workspace_allowed_for_conversation(
  _workspace_id   uuid,
  _organization_id uuid,
  _instance_id    uuid,
  _source_phone   text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv_key text;
  _ws_key   text;
  _tem_dono boolean;
BEGIN
  IF _workspace_id IS NULL THEN
    RETURN true;
  END IF;

  _conv_key := public.wz_conversation_phone_key(_instance_id, _source_phone);
  _ws_key   := public.wz_workspace_phone_key(_workspace_id);

  -- (a) os dois lados têm número e são números diferentes.
  IF _ws_key IS NOT NULL AND _conv_key IS NOT NULL AND _ws_key <> _conv_key THEN
    RETURN false;
  END IF;

  -- Vínculo direto pela instância cobre o caso de instância recém-criada cujo
  -- phone_number ainda não foi capturado (Fase 0): aí não há key, mas há vínculo.
  IF _instance_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = _workspace_id AND w.whatsapp_instance_id = _instance_id
  ) THEN
    RETURN true;
  END IF;

  -- (b) o número desta conversa já pertence a algum workspace ativo da org?
  IF _conv_key IS NULL THEN
    RETURN true;   -- conversa sem número identificável: nada a impor.
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.organization_id = _organization_id
      AND w.is_active = true
      AND public.wz_workspace_phone_key(w.id) = _conv_key
  ) INTO _tem_dono;

  IF _tem_dono THEN
    RETURN _ws_key IS NOT DISTINCT FROM _conv_key;
  END IF;

  -- (c) número órfão de dono → comportamento legado.
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.wz_workspace_allowed_for_conversation(uuid, uuid, uuid, text) IS
  'Regra "workspace = número": um workspace só pode receber conversas do número que ele atende. Liberado quando o número da conversa não tem workspace dono na org (retrocompatibilidade).';


-- ----------------------------------------------------------------------------
-- 4) GUARDA em conversations — barra o carimbo errado venha de onde vier
--    (campanha, fluxo, mover contatos em massa, UPDATE manual, SQL na mão).
--    É esta guarda que transforma a regra em INVARIANTE: nenhum caminho novo
--    precisa lembrar dela.
--
--    Vale também para ação humana explícita, de propósito: sob "workspace =
--    número", mover a conversa do número A para um workspace que não atende o
--    número A não é uma preferência, é um defeito — e ainda por cima quebra o
--    envio (workspace sem número não envia).
--
--    Não lança exceção (derrubaria webhook/campanha em produção): recusa a
--    mudança mantendo o valor anterior e registra WARNING no log do Postgres.
--    Quem chama por ação de usuário (safe-record-actions) confere o resultado e
--    devolve erro legível em vez de um silêncio.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_conversation_workspace_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.workspace_id IS NOT DISTINCT FROM OLD.workspace_id THEN
    RETURN NEW;
  END IF;

  IF NOT public.wz_workspace_allowed_for_conversation(
       NEW.workspace_id, NEW.organization_id, NEW.whatsapp_instance_id, NEW.source_phone
     ) THEN
    RAISE WARNING '[workspace-guard] conversa %: workspace % não atende o número % — carimbo recusado',
      COALESCE(NEW.id::text, '(nova)'), NEW.workspace_id,
      public.wz_conversation_phone_key(NEW.whatsapp_instance_id, NEW.source_phone);

    IF TG_OP = 'UPDATE' THEN
      NEW.workspace_id := OLD.workspace_id;
    ELSE
      NEW.workspace_id := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_conversation_workspace_number ON public.conversations;
CREATE TRIGGER trg_guard_conversation_workspace_number
  BEFORE INSERT OR UPDATE OF workspace_id ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_workspace_number();
-- Nome com 'g' > 'a': roda DEPOIS de trg_auto_assign_workspace (triggers BEFORE
-- de mesmo evento disparam em ordem alfabética), então também audita o que o
-- auto-assign acabou de escolher.


-- ----------------------------------------------------------------------------
-- 5a) auto_assign_workspace() — trigger em conversations.
--     Correções: exige a regra do número, exige is_active, ignora filtro vazio
--     e passa a ser DETERMINÍSTICO (era `LIMIT 1` sem ORDER BY = sorteio entre
--     workspaces que compartilham uma tag).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_assign_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  IF NEW.workspace_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT w.id INTO v_workspace_id
  FROM public.workspaces w
  WHERE w.organization_id = NEW.organization_id
    AND w.is_active = true
    AND w.filter_tag_ids IS NOT NULL
    AND array_length(w.filter_tag_ids, 1) > 0
    AND EXISTS (
      SELECT 1 FROM public.contact_tags ct
      WHERE ct.contact_id = NEW.contact_id
        AND ct.tag_id = ANY(w.filter_tag_ids)
    )
    AND public.wz_workspace_allowed_for_conversation(
          w.id, NEW.organization_id, NEW.whatsapp_instance_id, NEW.source_phone
        )
  ORDER BY w.created_at, w.id      -- determinístico: o mais antigo vence
  LIMIT 1;

  IF v_workspace_id IS NOT NULL THEN
    NEW.workspace_id := v_workspace_id;
  END IF;

  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------------------------
-- 5b) auto_assign_workspace_on_tag() — trigger em contact_tags.
--     Correções: determinístico; e o carimbo nas conversas passa a respeitar o
--     número. Era ele que puxava para o workspace novo a conversa do número
--     velho (qualquer conversa do contato ainda sem workspace).
--
--     O carimbo em contacts.workspace_id continua como era: contato não tem
--     número, é do CRM.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_assign_workspace_on_tag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id               uuid;
  _current_workspace_id uuid;
  _workspace_id         uuid;
BEGIN
  SELECT organization_id, workspace_id
  INTO _org_id, _current_workspace_id
  FROM public.contacts
  WHERE id = NEW.contact_id;

  -- Contato já tem workspace: não sobrescreve (campanha/atribuição manual mandam).
  IF _current_workspace_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _workspace_id
  FROM public.workspaces
  WHERE is_active = true
    AND organization_id = _org_id
    AND NEW.tag_id = ANY(filter_tag_ids)
  ORDER BY created_at, id          -- determinístico
  LIMIT 1;

  IF _workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.contacts
  SET workspace_id = _workspace_id
  WHERE id = NEW.contact_id;

  UPDATE public.conversations c
  SET workspace_id = _workspace_id
  WHERE c.contact_id = NEW.contact_id
    AND c.workspace_id IS NULL
    AND public.wz_workspace_allowed_for_conversation(
          _workspace_id, c.organization_id, c.whatsapp_instance_id, c.source_phone
        );

  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------------------------
-- 6) Permissões: mesmo padrão das demais funções internas (advisor hardening).
--    Só o backend chama; nada disso é RPC de front.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.wz_conversation_phone_key(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.wz_workspace_phone_key(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.wz_workspace_allowed_for_conversation(uuid, uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wz_conversation_phone_key(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wz_workspace_phone_key(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.wz_workspace_allowed_for_conversation(uuid, uuid, uuid, text) TO service_role;
