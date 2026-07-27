-- =====================================================================
-- Excluir tag: "Could not find the function public.delete_tag_safely"
--
-- A função foi escrita em 20260531143000_safe_delete_and_workspace_rpcs.sql
-- mas nunca chegou ao banco vivo (não aparece em src/integrations/supabase/
-- types.ts, que é gerado do schema real) — por isso o PostgREST devolve
-- PGRST202 para o RPC chamado em useDeleteTag.
--
-- Além de recriar, corrige um bug que faria a versão original estourar em
-- runtime: ela atualizava widgets.tag_id, coluna já removida em
-- 20260213202005 (hoje widgets só tem tag_ids).
--
-- A limpeza das colunas de array é feita por nome de coluna existente: o
-- schema já sofreu drift aqui, e um array esquecido deixa id de tag morta
-- apontando pra lugar nenhum. Não precisa filtrar por organização — o id da
-- tag é único e a posse já foi checada acima.
--
-- FKs para tags (contact_tags, instagram_contact_tags, scheduled_messages,
-- agent_instances.goal_tag_id, ...) são ON DELETE CASCADE/SET NULL, então o
-- DELETE final resolve sozinho.
--
-- Deploy: sobe PELO LOVABLE (nunca supabase db push).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.delete_tag_safely(_tag_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _target record;
BEGIN
  SELECT organization_id INTO _org_id
  FROM public.tags
  WHERE id = _tag_id;

  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Tag not found';
  END IF;

  IF _org_id <> public.get_user_org_id(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR _target IN
    SELECT v.tbl, v.col
    FROM (VALUES
      ('workspaces', 'filter_tag_ids'),
      ('widgets', 'tag_ids'),
      ('ai_agents', 'tag_ids'),
      ('pipeline_columns', 'auto_add_tag_ids')
    ) AS v(tbl, col)
    WHERE EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = v.tbl
        AND c.column_name = v.col
    )
  LOOP
    EXECUTE format(
      'UPDATE public.%1$I SET %2$I = array_remove(COALESCE(%2$I, ''{}''::uuid[]), $1) '
      'WHERE $1 = ANY(COALESCE(%2$I, ''{}''::uuid[]))',
      _target.tbl, _target.col
    ) USING _tag_id;
  END LOOP;

  DELETE FROM public.contact_tags WHERE tag_id = _tag_id;
  DELETE FROM public.tags WHERE id = _tag_id AND organization_id = _org_id;
END;
$$;

-- Mesmo regime de grants do hardening do Advisor (20260718150000):
-- nada para PUBLIC/anon, execução só para quem precisa.
REVOKE EXECUTE ON FUNCTION public.delete_tag_safely(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_tag_safely(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_tag_safely(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
