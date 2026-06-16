-- FIX (descoberto no smoke test da Fase 3C, 2026-06-16): o trigger
-- `trg_auto_assign_workspace` (BEFORE INSERT OR UPDATE OF contact_id ON conversations)
-- chama `auto_assign_workspace()`, que tratava `workspaces.filter_tag_ids` como JSONB:
--   t.id::text = ANY(SELECT jsonb_array_elements_text(w.filter_tag_ids))
-- Mas `filter_tag_ids` é do tipo `uuid[]`, então o Postgres lançava
--   "function jsonb_array_elements_text(uuid[]) does not exist"
-- e QUALQUER criação de conversa nova falhava (webhook de entrada, flows,
-- agendamentos, etc.) em orgs com workspace tag-filtrado. Contatos que já tinham
-- conversa passavam (não inserem); contatos novos quebravam.
--
-- Esta função NÃO estava versionada no repo (drift banco↔migrations) — a versão
-- viva no banco foi obtida via pg_get_functiondef. Aqui ela passa a ser versionada,
-- com a única correção: comparação nativa de array (t.id = ANY(w.filter_tag_ids)).
--
-- Aplicação: MANUAL no SQL Editor (regra de deploy Lovable). É um CREATE OR REPLACE,
-- então o trigger existente continua válido (não precisa recriar o trigger).

CREATE OR REPLACE FUNCTION public.auto_assign_workspace()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_workspace_id uuid;
BEGIN
  IF NEW.workspace_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT w.id INTO v_workspace_id
  FROM workspaces w
  WHERE w.organization_id = NEW.organization_id
    AND w.filter_tag_ids IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM contact_tags ct
      JOIN tags t ON t.id = ct.tag_id
      WHERE ct.contact_id = NEW.contact_id
        AND t.id = ANY(w.filter_tag_ids)   -- FIX: filter_tag_ids é uuid[], não jsonb
    )
  LIMIT 1;

  IF v_workspace_id IS NOT NULL THEN
    NEW.workspace_id = v_workspace_id;
  END IF;

  RETURN NEW;
END;
$function$;
