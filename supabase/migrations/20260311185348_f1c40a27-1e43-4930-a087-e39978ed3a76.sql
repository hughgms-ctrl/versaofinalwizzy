ALTER TABLE public.generated_documents 
ADD COLUMN IF NOT EXISTS submitted_by jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS submission_group text DEFAULT NULL;