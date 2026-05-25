ALTER TABLE public.flows ADD COLUMN IF NOT EXISTS workspace_ids uuid[] DEFAULT '{}'::uuid[];
ALTER TABLE public.flow_folders ADD COLUMN IF NOT EXISTS workspace_ids uuid[] DEFAULT '{}'::uuid[];

-- Backfill from legacy workspace_id
UPDATE public.flows SET workspace_ids = ARRAY[workspace_id] WHERE workspace_id IS NOT NULL AND (workspace_ids IS NULL OR array_length(workspace_ids,1) IS NULL);
UPDATE public.flow_folders SET workspace_ids = ARRAY[workspace_id] WHERE workspace_id IS NOT NULL AND (workspace_ids IS NULL OR array_length(workspace_ids,1) IS NULL);

CREATE INDEX IF NOT EXISTS idx_flows_workspace_ids ON public.flows USING GIN (workspace_ids);
CREATE INDEX IF NOT EXISTS idx_flow_folders_workspace_ids ON public.flow_folders USING GIN (workspace_ids);