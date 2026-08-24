-- =============================================================================
-- Contato pode aparecer em mais de um workspace
-- =============================================================================
-- Problema: o contato é da ORGANIZAÇÃO (a identidade dele é organization_id +
-- telefone -- é assim que o zapi-webhook e a importação o encontram), mas a
-- visibilidade dele é de UM workspace só, porque contacts.workspace_id é uma
-- coluna única. Consequência: se o telefone já existe no workspace A, quem está
-- no workspace B não vê o contato na lista (a lista filtra por workspace_id) e
-- também não consegue criá-lo -- a validação de duplicidade, que é por org,
-- barra com "Já existe um contato com este telefone". O contato fica preso: o
-- usuário não tem nem o registro nem o direito de criar outro.
--
-- Fix: workspace_id continua sendo o workspace de ORIGEM do contato (nada é
-- movido, nada muda para quem já trabalha nele) e ganha um acompanhante:
-- shared_workspace_ids, a lista dos outros workspaces em que esse mesmo
-- contato também aparece. Criar/importar/receber mensagem de um telefone que
-- já existe passa a ADICIONAR o workspace atual a essa lista em vez de barrar
-- ou de roubar o contato de quem já o tinha.
--
-- Array em vez de tabela de junção porque a pergunta que o app faz é sempre
-- "este contato aparece no workspace X?" -- um `@>` com índice GIN responde
-- isso direto no filtro da lista, sem join, e mantém o filtro num único ponto
-- do front (applyWorkspaceFilter).
--
-- Conversa NÃO é afetada: ela continua pertencendo ao número/workspace em que
-- aconteceu (regra da migration 20260818120000). Compartilhar o contato faz os
-- dois times verem a MESMA ficha -- nome, campos personalizados, etiquetas --
-- e cada um continua vendo só as conversas do próprio número.
--
-- DEPLOY: aplicar manualmente no SQL Editor do Supabase (mesma regra das
-- migrations anteriores -- NÃO usar `supabase db push`).
-- =============================================================================

BEGIN;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS shared_workspace_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.contacts.shared_workspace_ids IS
  'Outros workspaces em que este contato também aparece. workspace_id continua sendo o de origem; este array é visibilidade adicional, não move nada.';

-- O filtro da lista pergunta "contém o workspace X?" -- GIN é o índice que
-- responde isso sem varrer a tabela.
CREATE INDEX IF NOT EXISTS idx_contacts_shared_workspace_ids
  ON public.contacts USING gin (shared_workspace_ids);

-- -----------------------------------------------------------------------------
-- Políticas "by workspace"
-- -----------------------------------------------------------------------------
-- Hoje elas convivem com as políticas por organização (lote 1), e como policies
-- permissivas se somam com OR, o acesso efetivo a contacts já é por org -- estas
-- aqui não restringem nada na prática. Ainda assim são atualizadas: se um dia as
-- de org forem estreitadas, um contato compartilhado ficaria invisível para o
-- workspace com quem ele foi compartilhado, e o bug voltaria por baixo.
DROP POLICY IF EXISTS "Users can view contacts by workspace" ON public.contacts;
CREATE POLICY "Users can view contacts by workspace"
ON public.contacts FOR SELECT
USING (
    organization_id = public.get_user_org_id((select auth.uid()))
    AND (
        (workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), workspace_id))
        OR EXISTS (
            SELECT 1
            FROM unnest(shared_workspace_ids) AS shared(id)
            WHERE public.user_has_workspace_access((select auth.uid()), shared.id)
        )
    )
);

DROP POLICY IF EXISTS "Users can manage contacts by workspace" ON public.contacts;
CREATE POLICY "Users can manage contacts by workspace"
ON public.contacts FOR ALL
USING (
    organization_id = public.get_user_org_id((select auth.uid()))
    AND (
        (workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), workspace_id))
        OR EXISTS (
            SELECT 1
            FROM unnest(shared_workspace_ids) AS shared(id)
            WHERE public.user_has_workspace_access((select auth.uid()), shared.id)
        )
    )
)
WITH CHECK (
    organization_id = public.get_user_org_id((select auth.uid()))
    AND (
        (workspace_id IS NOT NULL AND public.user_has_workspace_access((select auth.uid()), workspace_id))
        OR EXISTS (
            SELECT 1
            FROM unnest(shared_workspace_ids) AS shared(id)
            WHERE public.user_has_workspace_access((select auth.uid()), shared.id)
        )
    )
);

-- -----------------------------------------------------------------------------
-- RPCs de compartilhamento
-- -----------------------------------------------------------------------------
-- Por que RPC e não um UPDATE direto do app: ler o array, acrescentar e gravar
-- de volta perde escrita quando dois workspaces compartilham o mesmo contato ao
-- mesmo tempo (o segundo grava por cima do primeiro). Aqui o array é montado
-- dentro do próprio UPDATE, então a linha é lida e escrita de uma vez só.

CREATE OR REPLACE FUNCTION public.share_contact_with_workspace(
  _contact_id uuid,
  _workspace_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org       uuid;
  v_ws_org    uuid;
  v_owner     uuid;
  v_changed   int := 0;
BEGIN
  SELECT organization_id, workspace_id INTO v_org, v_owner
  FROM public.contacts WHERE id = _contact_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'contato % não encontrado', _contact_id USING ERRCODE = 'P0002';
  END IF;

  -- Chamador humano precisa ser da org do contato. Edge function com
  -- service_role não tem auth.uid() e já roda com escopo confiável.
  IF (select auth.uid()) IS NOT NULL
     AND NOT public.user_is_org_member((select auth.uid()), v_org) THEN
    RAISE EXCEPTION 'access denied to contact %', _contact_id USING ERRCODE = '42501';
  END IF;

  -- Compartilhamento NUNCA cruza organizações: o workspace tem que ser da
  -- mesma org do contato. É o que garante que org A e org B sigam isoladas.
  SELECT organization_id INTO v_ws_org FROM public.workspaces WHERE id = _workspace_id;
  IF v_ws_org IS NULL OR v_ws_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'workspace % não pertence à organização do contato', _workspace_id
      USING ERRCODE = '42501';
  END IF;

  -- Contato órfão (sem workspace) é adotado em vez de compartilhado -- senão ele
  -- apareceria ao mesmo tempo no workspace novo e em "Não atribuído".
  IF v_owner IS NULL THEN
    UPDATE public.contacts
       SET workspace_id = _workspace_id, updated_at = now()
     WHERE id = _contact_id AND workspace_id IS NULL;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RETURN v_changed > 0;
  END IF;

  UPDATE public.contacts
     SET shared_workspace_ids = (
           SELECT array_agg(DISTINCT ws)
           FROM unnest(shared_workspace_ids || _workspace_id) AS ws
         ),
         updated_at = now()
   WHERE id = _contact_id
     AND workspace_id IS DISTINCT FROM _workspace_id
     AND NOT (shared_workspace_ids @> ARRAY[_workspace_id]);
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  RETURN v_changed > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.unshare_contact_from_workspace(
  _contact_id uuid,
  _workspace_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org     uuid;
  v_changed int := 0;
BEGIN
  SELECT organization_id INTO v_org FROM public.contacts WHERE id = _contact_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'contato % não encontrado', _contact_id USING ERRCODE = 'P0002';
  END IF;

  IF (select auth.uid()) IS NOT NULL
     AND NOT public.user_is_org_member((select auth.uid()), v_org) THEN
    RAISE EXCEPTION 'access denied to contact %', _contact_id USING ERRCODE = '42501';
  END IF;

  -- Só mexe na lista de compartilhamento. O workspace de origem não é removido
  -- por aqui: tirar o dono deixaria o contato sem casa, e "mover de workspace"
  -- já tem caminho próprio (set_contacts_workspace).
  UPDATE public.contacts
     SET shared_workspace_ids = array_remove(shared_workspace_ids, _workspace_id),
         updated_at = now()
   WHERE id = _contact_id
     AND shared_workspace_ids @> ARRAY[_workspace_id];
  GET DIAGNOSTICS v_changed = ROW_COUNT;

  RETURN v_changed > 0;
END;
$$;

-- Toda função nova nasce com EXECUTE para PUBLIC (mesma pegadinha das migrations
-- de hardening de 2026-07-18).
REVOKE EXECUTE ON FUNCTION public.share_contact_with_workspace(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.share_contact_with_workspace(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.share_contact_with_workspace(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.unshare_contact_from_workspace(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unshare_contact_from_workspace(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.unshare_contact_from_workspace(uuid, uuid) TO authenticated, service_role;

COMMIT;

-- =============================================================================
-- Conferência (rodar depois, fora da transação)
-- =============================================================================
-- Contatos compartilhados com mais de um workspace:
--
--   SELECT id, name, phone, workspace_id, shared_workspace_ids
--   FROM public.contacts
--   WHERE cardinality(shared_workspace_ids) > 0
--   ORDER BY updated_at DESC
--   LIMIT 50;
--
-- Telefones que existem uma vez só na org mas estão presos num workspace --
-- candidatos naturais a compartilhamento (nenhuma ação automática é tomada
-- sobre eles: o compartilhamento só acontece quando alguém tenta usar o
-- contato no outro workspace):
--
--   SELECT phone, count(*), array_agg(DISTINCT workspace_id)
--   FROM public.contacts
--   WHERE organization_id = '<org>'
--   GROUP BY phone
--   HAVING count(*) > 1;
