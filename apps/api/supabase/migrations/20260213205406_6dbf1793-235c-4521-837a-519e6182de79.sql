-- Add workspace_id to flow_folders
ALTER TABLE public.flow_folders ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL DEFAULT NULL;