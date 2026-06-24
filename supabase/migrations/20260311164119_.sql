
ALTER TABLE public.document_packs 
ADD COLUMN IF NOT EXISTS field_config jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS public_token text UNIQUE DEFAULT NULL;
;
