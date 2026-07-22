-- Objetivo de conversão por orquestração (ver conversa com o usuário: o
-- percentual de conversão mostrado no card precisa vir de dado real, não de um
-- número estático em agent_templates). v1 = só por tag: a orquestração aponta
-- uma tag que, ao ser aplicada num contato que passou por esse fluxo, marca
-- conversão. Etapa de pipeline fica de fora por enquanto -- não existe
-- histórico de "quando o card entrou nessa coluna", só o estado atual.
ALTER TABLE public.agent_instances
  ADD COLUMN goal_tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL;

-- Calcula conversão real de uma instância: quantos contatos entraram no fluxo
-- dela (via flow_executions) e, desses, quantos têm a tag-objetivo aplicada.
-- SECURITY DEFINER porque flow_executions/contact_tags têm RLS por org, mas a
-- checagem de organização é feita aqui dentro (via agent_instances.organization_id
-- comparado à org do usuário chamador) -- sem isso, cada call site precisaria
-- reimplementar o mesmo join com join RLS-safe.
CREATE OR REPLACE FUNCTION public.get_agent_instance_conversion(_instance_id uuid)
RETURNS TABLE(entries bigint, conversions bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flow_id uuid;
  v_goal_tag_id uuid;
  v_org_id uuid;
BEGIN
  SELECT flow_id, goal_tag_id, organization_id
    INTO v_flow_id, v_goal_tag_id, v_org_id
  FROM public.agent_instances
  WHERE id = _instance_id;

  IF v_flow_id IS NULL OR v_org_id IS NULL OR v_org_id <> public.get_user_org_id((select auth.uid())) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH entered AS (
    SELECT DISTINCT c.contact_id
    FROM public.flow_executions fe
    JOIN public.conversations c ON c.id = fe.conversation_id
    WHERE fe.flow_id = v_flow_id
  )
  SELECT
    (SELECT count(*) FROM entered)::bigint AS entries,
    CASE WHEN v_goal_tag_id IS NULL THEN 0::bigint ELSE (
      SELECT count(*) FROM entered e
      WHERE EXISTS (
        SELECT 1 FROM public.contact_tags ct
        WHERE ct.contact_id = e.contact_id AND ct.tag_id = v_goal_tag_id
      )
    )::bigint END AS conversions;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_agent_instance_conversion(uuid) TO authenticated;
