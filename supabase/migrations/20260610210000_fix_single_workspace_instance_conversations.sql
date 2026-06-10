-- If a WhatsApp instance is linked to exactly one active workspace, that
-- workspace is the owner of conversations received by that instance.
-- This repairs conversations that were created in the wrong workspace before
-- the routing rule was corrected.

WITH single_instance_workspace AS (
  SELECT
    organization_id,
    whatsapp_instance_id,
    min(id) AS workspace_id
  FROM public.workspaces
  WHERE whatsapp_instance_id IS NOT NULL
    AND is_active = true
  GROUP BY organization_id, whatsapp_instance_id
  HAVING count(*) = 1
)
UPDATE public.conversations c
SET workspace_id = siw.workspace_id
FROM single_instance_workspace siw
WHERE c.organization_id = siw.organization_id
  AND c.whatsapp_instance_id = siw.whatsapp_instance_id
  AND c.workspace_id IS DISTINCT FROM siw.workspace_id;
