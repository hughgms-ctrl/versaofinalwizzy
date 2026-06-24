-- 1. Add fill mode and public token to generated_documents
ALTER TABLE public.generated_documents
  ADD COLUMN IF NOT EXISTS fill_mode text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS public_fill_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS is_filled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS signature_config jsonb;

CREATE INDEX IF NOT EXISTS idx_generated_documents_public_fill_token
  ON public.generated_documents(public_fill_token)
  WHERE public_fill_token IS NOT NULL;

COMMENT ON COLUMN public.generated_documents.fill_mode IS 'internal = filled by user; public = filled by recipient via link';
COMMENT ON COLUMN public.generated_documents.signature_config IS 'Stored config to apply after public filling: { signing_method, require_selfie, otp_channel, signers: [...] }';

-- 2. Create document_signers table for multiple parallel signers
CREATE TABLE IF NOT EXISTS public.document_signers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  generated_document_id uuid NOT NULL REFERENCES public.generated_documents(id) ON DELETE CASCADE,
  pack_id uuid REFERENCES public.document_packs(id) ON DELETE CASCADE,
  signature_id uuid REFERENCES public.document_signatures(id) ON DELETE SET NULL,
  signer_name text NOT NULL,
  signer_email text,
  signer_phone text,
  signer_cpf text,
  signer_role text DEFAULT 'Assinar',
  signing_method text NOT NULL DEFAULT 'internal',
  auth_methods jsonb NOT NULL DEFAULT '{"manuscrita": true, "otp_email": false, "otp_sms": false, "selfie": false}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  signature_token text UNIQUE,
  signed_at timestamptz,
  sent_at timestamptz,
  "order" int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_signers_doc ON public.document_signers(generated_document_id);
CREATE INDEX IF NOT EXISTS idx_document_signers_org ON public.document_signers(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_signers_pack ON public.document_signers(pack_id);
CREATE INDEX IF NOT EXISTS idx_document_signers_token ON public.document_signers(signature_token) WHERE signature_token IS NOT NULL;

ALTER TABLE public.document_signers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view their document signers"
  ON public.document_signers FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Org members create document signers"
  ON public.document_signers FOR INSERT
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Org members update their document signers"
  ON public.document_signers FOR UPDATE
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Org members delete their document signers"
  ON public.document_signers FOR DELETE
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE TRIGGER update_document_signers_updated_at
  BEFORE UPDATE ON public.document_signers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();;
