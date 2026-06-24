-- Add workspace_id to tags table
ALTER TABLE public.tags ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- Create index for workspace filtering
CREATE INDEX idx_tags_workspace_id ON public.tags(workspace_id);;
