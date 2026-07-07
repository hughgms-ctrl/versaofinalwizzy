-- ============================================================================
-- FASE 3 — RECONNECT COMPLETO: readoção de órfãs por WORKSPACE.
-- ----------------------------------------------------------------------------
-- Fecha o buraco dos LEGADOS com source_phone NULL (ex.: org a0a518a0, 10 chats
-- do workspace "geral", número deletado). A readoção por número
-- (adopt_orphan_conversations_for_instance) é cega quando source_phone é NULL —
-- match_key('') nunca casa. Aqui o gatilho é INEQUÍVOCO: o usuário (re)vincula um
-- workspace a uma instância no UI ("este workspace = este número"), e adotamos as
-- órfãs daquele workspace para a instância.
--
-- Decisão de design (confirmada 2026-07-07): opção (a) — re-link MANUAL como
-- gatilho. Sem gravar phone estável no workspace nem reapontar automático no
-- connect (robustez futura, não agora).
--
-- Reusa `_wz_merge_conversation_pair` (Fase 1) para colisão (contato já com
-- conversa na instância). O trigger da Fase 1 (sync_conversation_hidden_flag)
-- des-esconde sozinho ao carimbar a instância. NUNCA cruza números diferentes:
-- o escopo é sempre (workspace, instância) explícito pelo usuário.
--
-- >>> Rode PASSO A PASSO. PARTE 3 tem dry-run antes do real. <<<
-- Aplicação: MANUAL no SQL Editor do Supabase (regra de deploy Lovable).
-- Reversível: DROP FUNCTION (não altera dados por si só). PARTE 3 é o único passo
-- que move dados — e só depois do dry-run bater.
-- ============================================================================

-- ============================================================================
-- PARTE 1 — RPC de readoção por workspace (idempotente).
-- ----------------------------------------------------------------------------
-- _dry_run = true → só CONTA quantas seriam adotadas, não altera nada.
-- _dry_run = false → carimba/funde. Chamada pelo código nos 3 pontos de re-link
--   (zapi-save-credentials, WhatsAppInstancesSettings, useWorkspaces) com 2 args
--   (dry_run default false = executa).
-- Segurança: SECURITY DEFINER fura RLS p/ ver órfãs. Defesa contra IDOR — se
--   chamada por usuário autenticado que NÃO é membro da org da instância, RETURN 0
--   (service_role tem auth.uid() NULL → pula a checagem, pode readotar).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.adopt_orphan_conversations_for_workspace(
  _workspace_id uuid,
  _instance_id  uuid,
  _dry_run      boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id     uuid;
  _ws_org     uuid;
  _inst_phone text;
  _orphan     record;
  _keeper_id  uuid;
  _adopted    integer := 0;
BEGIN
  IF _workspace_id IS NULL OR _instance_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Resolve org + número da instância alvo.
  SELECT organization_id, phone_number
  INTO _org_id, _inst_phone
  FROM public.whatsapp_instances
  WHERE id = _instance_id;

  IF _org_id IS NULL THEN
    RETURN 0;
  END IF;

  -- O workspace tem que ser da MESMA org da instância (nunca cruza orgs/números).
  SELECT organization_id INTO _ws_org
  FROM public.workspaces
  WHERE id = _workspace_id;

  IF _ws_org IS NULL OR _ws_org <> _org_id THEN
    RETURN 0;
  END IF;

  -- Defesa IDOR: usuário autenticado precisa ser membro da org. service_role
  -- (auth.uid() NULL) fura, pra poder readotar do webhook/edge.
  IF (select auth.uid()) IS NOT NULL
     AND NOT public.user_is_org_member((select auth.uid()), _org_id) THEN
    RETURN 0;
  END IF;

  -- Percorre as órfãs (sem instância) DAQUELE workspace, na org da instância.
  FOR _orphan IN
    SELECT id, contact_id
    FROM public.conversations
    WHERE whatsapp_instance_id IS NULL
      AND organization_id = _org_id
      AND workspace_id = _workspace_id
    ORDER BY created_at ASC
  LOOP
    IF _dry_run THEN
      _adopted := _adopted + 1;
      CONTINUE;
    END IF;

    -- Já existe conversa desse contato NA instância alvo? (duplicado do webhook
    -- ou órfã já adotada nesta mesma execução) → colisão no índice parcial
    -- idx_conversations_contact_org_instance_unique. Funde em vez de carimbar.
    SELECT id INTO _keeper_id
    FROM public.conversations
    WHERE contact_id = _orphan.contact_id
      AND organization_id = _org_id
      AND whatsapp_instance_id = _instance_id
      AND id <> _orphan.id
    LIMIT 1;

    IF _keeper_id IS NOT NULL THEN
      -- Funde a órfã (_src) na keeper (_dst): move FKs, mescla contadores, apaga _src.
      PERFORM public._wz_merge_conversation_pair(_orphan.id, _keeper_id);
    ELSE
      -- Caminho feliz: carimba a instância (trigger des-esconde) e backfilla o número.
      UPDATE public.conversations
      SET whatsapp_instance_id = _instance_id,
          source_phone = COALESCE(source_phone, _inst_phone)
      WHERE id = _orphan.id;
    END IF;

    _adopted := _adopted + 1;
  END LOOP;

  RETURN _adopted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adopt_orphan_conversations_for_workspace(uuid, uuid, boolean)
  TO authenticated, service_role;


-- ============================================================================
-- PARTE 2 — DIAGNÓSTICO (read-only). Mapeia órfãs por workspace e se há
-- instância conectada disponível para readotar.
-- ----------------------------------------------------------------------------
-- Rode no SQL Editor (service_role vê tudo). Colunas:
--   • orphans      = conversas do workspace sem instância (candidatas)
--   • ws_instance  = whatsapp_instance_id atual do workspace (provável NULL pós-delete)
--   • connected_in_org = quantas instâncias conectadas a org tem (alvo p/ re-link)
-- ----------------------------------------------------------------------------
SELECT
  c.organization_id,
  c.workspace_id,
  w.name                                   AS workspace_name,
  count(*)                                 AS orphans,
  w.whatsapp_instance_id                   AS ws_instance,
  (SELECT count(*) FROM public.whatsapp_instances wi
    WHERE wi.organization_id = c.organization_id
      AND wi.status = 'connected')         AS connected_in_org
FROM public.conversations c
LEFT JOIN public.workspaces w ON w.id = c.workspace_id
WHERE c.whatsapp_instance_id IS NULL
  AND c.workspace_id IS NOT NULL
GROUP BY c.organization_id, c.workspace_id, w.name, w.whatsapp_instance_id
ORDER BY orphans DESC;


-- ============================================================================
-- PARTE 3 — RECUPERAÇÃO one-shot dos legados (ex.: a0a518a0 / workspace "geral").
-- ----------------------------------------------------------------------------
-- PRÉ-REQUISITO: o número precisa estar RECONECTADO (existe instância connected
-- na org). Daqui pra frente o fluxo normal é: reconectar o número → re-linkar o
-- workspace no UI → o código chama a RPC automaticamente. Este passo manual é o
-- fallback / para recuperar AGORA sem mexer no UI.
--
-- 1) Descubra os UUIDs (rode e copie):
--    SELECT id, name, whatsapp_instance_id FROM public.workspaces
--      WHERE organization_id = 'a0a518a0-...'::uuid;         -- pega o workspace "geral"
--    SELECT id, phone_number, status FROM public.whatsapp_instances
--      WHERE organization_id = 'a0a518a0-...'::uuid AND status = 'connected';
--
-- 2) DRY-RUN (não altera nada — deve retornar ~10 p/ o "geral"):
--    SELECT public.adopt_orphan_conversations_for_workspace(
--      '<workspace_geral_id>'::uuid, '<instancia_conectada_id>'::uuid, true);
--
-- 3) EXECUTAR (só se o dry-run bater com o esperado):
--    SELECT public.adopt_orphan_conversations_for_workspace(
--      '<workspace_geral_id>'::uuid, '<instancia_conectada_id>'::uuid, false);
--
-- 4) CONFERIR (as 10 devem sair de hidden e ganhar a instância):
--    SELECT count(*) FILTER (WHERE hidden_by_disconnect) AS escondidas,
--           count(*) FILTER (WHERE NOT hidden_by_disconnect) AS visiveis
--    FROM public.conversations WHERE organization_id = 'a0a518a0-...'::uuid;
-- ============================================================================
