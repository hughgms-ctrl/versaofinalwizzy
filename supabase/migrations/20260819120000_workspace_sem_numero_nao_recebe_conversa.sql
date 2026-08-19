-- ============================================================================
-- Workspace SEM número não recebe conversa
--
-- SINTOMA (2026-08-19, reportado pelo usuário): depois de desvincular o número
-- do "Comercial 2" e mover as conversas na mão, o Comercial 2 zerou — e mesmo
-- assim apareceu uma conversa nova nele. "Se nenhum número aponta para ele, ele
-- não deveria ter conversa."
--
-- CAUSA — duas peças que se encaixam:
--
-- 1) A regra de 20260818120000 tinha uma cláusula de retrocompatibilidade grande
--    demais: "se o número da conversa não tem workspace dono na org, libera".
--    Ela existe para não quebrar orgs que nunca vincularam número a workspace.
--    Mas quando o número FICA sem dono (foi exatamente o que aconteceu ao
--    desvincular), ela passa a liberar QUALQUER workspace — inclusive um sem
--    número nenhum.
--
-- 2) O zapi-webhook, quando a instância não resolve para nenhum workspace,
--    caía em `contact.workspace_id` — o workspace do CONTATO, que é do CRM e não
--    tem relação com o número que recebeu a mensagem. Como as conversas foram
--    movidas na mão mas os contatos não, os contatos seguiam apontando para o
--    Comercial 2, e a primeira mensagem nova recriava a conversa lá.
--    (Corrigido junto, no código: a única fonte passa a ser o número.)
--
-- CORREÇÃO AQUI: uma cláusula nova, antes da retrocompatibilidade — se o
-- workspace de destino não atende número nenhum E a org organiza workspaces por
-- número (tem ao menos um workspace ativo com número), ele não recebe conversa.
-- Vale para qualquer origem, inclusive movimentação manual, que é o que o
-- usuário pediu.
--
-- RETROCOMPATIBILIDADE PRESERVADA: em org onde NENHUM workspace ativo tem número
-- vinculado, nada muda — a cláusula não dispara e o comportamento antigo por tag
-- continua valendo.
--
-- NÃO move dados: linhas já carimbadas continuam onde estão (a guarda só age na
-- mudança). Para limpar o que já entrou, use docs/sanear-conversas-workspace-errado.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.wz_workspace_allowed_for_conversation(
  _workspace_id    uuid,
  _organization_id uuid,
  _instance_id     uuid,
  _source_phone    text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv_key       text;
  _ws_key         text;
  _org_usa_numero boolean;
  _tem_dono       boolean;
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

  -- Vínculo direto pela instância cobre a instância recém-criada cujo
  -- phone_number ainda não foi capturado (Fase 0): não há key, mas há vínculo.
  IF _instance_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = _workspace_id AND w.whatsapp_instance_id = _instance_id
  ) THEN
    RETURN true;
  END IF;

  -- (a2) NOVA: workspace que não atende número nenhum não recebe conversa, desde
  -- que a org organize workspaces por número. Sem isto, bastava o número da
  -- conversa perder o dono para um workspace órfão virar destino válido.
  IF _ws_key IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.organization_id = _organization_id
        AND w.is_active = true
        AND w.whatsapp_instance_id IS NOT NULL
    ) INTO _org_usa_numero;

    IF _org_usa_numero THEN
      RETURN false;
    END IF;

    RETURN true;   -- org que não usa vínculo por número: comportamento antigo.
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

  -- (c) número sem dono e workspace COM número: já foi comparado em (a).
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.wz_workspace_allowed_for_conversation(uuid, uuid, uuid, text) IS
  'Regra "workspace = número": um workspace só recebe conversas do número que ele atende, e workspace sem número não recebe conversa nenhuma em org que organiza workspaces por número. Liberado apenas em orgs que não vinculam número a workspace (retrocompatibilidade).';
