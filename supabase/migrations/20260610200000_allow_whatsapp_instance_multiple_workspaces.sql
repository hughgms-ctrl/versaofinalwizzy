-- A WhatsApp number can be linked to multiple workspaces. Keep the legacy
-- primary workspace_id for compatibility and add workspace_ids for visibility.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS workspace_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

UPDATE public.conversations
SET workspace_ids = ARRAY[workspace_id]
WHERE workspace_id IS NOT NULL
  AND (workspace_ids IS NULL OR cardinality(workspace_ids) = 0);

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
  workspace_id = COALESCE(c.workspace_id, iw.workspace_ids[1]),
  workspace_ids = (
    SELECT array_agg(DISTINCT value)
    FROM unnest(COALESCE(c.workspace_ids, '{}'::uuid[]) || iw.workspace_ids) AS value
  )
FROM instance_workspaces iw
WHERE c.organization_id = iw.organization_id
  AND c.whatsapp_instance_id = iw.whatsapp_instance_id;

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_ids
  ON public.conversations USING gin(workspace_ids);
