-- Add workspace_id to widget_folders (same pattern as flow_folders)
ALTER TABLE public.widget_folders 
ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL DEFAULT NULL;