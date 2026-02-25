
-- Add workspace_ids array column to pipelines
ALTER TABLE public.pipelines ADD COLUMN workspace_ids uuid[] DEFAULT '{}'::uuid[];

-- Migrate existing workspace_id data to workspace_ids
UPDATE public.pipelines 
SET workspace_ids = ARRAY[workspace_id] 
WHERE workspace_id IS NOT NULL;

-- Drop the old workspace_id column and its foreign key
ALTER TABLE public.pipelines DROP COLUMN workspace_id;
