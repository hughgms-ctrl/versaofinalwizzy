ALTER TABLE public.generated_documents
ADD COLUMN IF NOT EXISTS signed_pdf_url text,
ADD COLUMN IF NOT EXISTS signed_at timestamp with time zone;