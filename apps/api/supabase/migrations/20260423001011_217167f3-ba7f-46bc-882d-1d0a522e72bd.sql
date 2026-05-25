
ALTER TABLE public.signature_evidence
  ADD COLUMN IF NOT EXISTS verification_code text,
  ADD COLUMN IF NOT EXISTS geolocation jsonb,
  ADD COLUMN IF NOT EXISTS original_pdf_url text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_signature_evidence_verification_code
  ON public.signature_evidence (verification_code)
  WHERE verification_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_signature_evidence_document_hash
  ON public.signature_evidence (document_hash)
  WHERE document_hash IS NOT NULL;
