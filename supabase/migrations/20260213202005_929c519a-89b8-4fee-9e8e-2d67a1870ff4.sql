-- Replace single tag_id with array tag_ids
ALTER TABLE public.widgets DROP COLUMN IF EXISTS tag_id;
ALTER TABLE public.widgets ADD COLUMN tag_ids uuid[] DEFAULT '{}'::uuid[];