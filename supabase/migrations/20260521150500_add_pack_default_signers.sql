ALTER TABLE public.document_packs
ADD COLUMN IF NOT EXISTS default_signers jsonb DEFAULT '[]'::jsonb;
