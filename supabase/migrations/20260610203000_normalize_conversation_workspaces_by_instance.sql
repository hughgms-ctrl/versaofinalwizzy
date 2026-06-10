-- Existing conversations must follow the current workspace links of the
-- receiving WhatsApp instance. This fixes conversations that were previously
-- kept in an old workspace after the number was moved.

WITH instance_workspaces AS (
  SELECT
    organization_id,
    whatsapp_instance_id,
    array_agg(id ORDER BY created_at ASC, id ASC) AS workspace_ids
  FROM public.workspaces
  WHERE whatsapp_instance_id IS NOT NULL
    AND is_active = true
  GROUP BY organization_id, whatsapp_instance_id
)
UPDATE public.conversations c
SET
  workspace_id = iw.workspace_ids[1],
  workspace_ids = iw.workspace_ids
FROM instance_workspaces iw
WHERE c.organization_id = iw.organization_id
  AND c.whatsapp_instance_id = iw.whatsapp_instance_id;
