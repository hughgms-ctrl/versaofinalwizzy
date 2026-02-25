-- Add column to store pipeline IDs where unassigned column should be hidden
ALTER TABLE public.user_permissions 
ADD COLUMN hide_unassigned_pipeline_ids uuid[] DEFAULT '{}'::uuid[];