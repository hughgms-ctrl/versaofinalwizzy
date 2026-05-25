@"
-- =============================================
-- CORREÇÃO DEFINITIVA WIZZY - MULTITENANCY
-- Problema 1: source_phone bloqueando RLS
-- Problema 2: workspace_id nulo sumindo conversas
-- =============================================

DROP POLICY IF EXISTS "Users can view conversations in their organization" ON conversations;
DROP POLICY IF EXISTS "Users can manage conversations in their organization" ON conversations;
DROP POLICY IF EXISTS "Users can delete conversations in their organization" ON conversations;

CREATE POLICY "Users can view conversations in their organization"
ON conversations FOR SELECT
USING (
  organization_id = get_user_org_id(auth.uid())
  AND (
    source_phone IS NULL
    OR RIGHT(source_phone, 11) = RIGHT(get_active_phone_number(organization_id), 11)
  )
);

CREATE POLICY "Users can manage conversations in their organization"
ON conversations FOR ALL
USING (
  organization_id = get_user_org_id(auth.uid())
  AND (
    source_phone IS NULL
    OR RIGHT(source_phone, 11) = RIGHT(get_active_phone_number(organization_id), 11)
  )
);

CREATE POLICY "Users can delete conversations in their organization"
ON conversations FOR DELETE
USING (
  organization_id = get_user_org_id(auth.uid())
  AND (
    source_phone IS NULL
    OR RIGHT(source_phone, 11) = RIGHT(get_active_phone_number(organization_id), 11)
  )
);

CREATE OR REPLACE FUNCTION auto_assign_workspace()
RETURNS trigger
LANGUAGE plpgsql
AS \$\$
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
        AND t.id::text = ANY(
          SELECT jsonb_array_elements_text(w.filter_tag_ids)
        )
    )
  LIMIT 1;

  IF v_workspace_id IS NOT NULL THEN
    NEW.workspace_id = v_workspace_id;
  END IF;

  RETURN NEW;
END;
\$\$;

DROP TRIGGER IF EXISTS trg_auto_assign_workspace ON conversations;

CREATE TRIGGER trg_auto_assign_workspace
BEFORE INSERT OR UPDATE OF contact_id ON conversations
FOR EACH ROW
EXECUTE FUNCTION auto_assign_workspace();
