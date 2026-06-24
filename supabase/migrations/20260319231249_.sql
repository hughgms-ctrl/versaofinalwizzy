
-- Table for OTP codes used in signature verification
CREATE TABLE public.signature_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_id UUID NOT NULL REFERENCES public.document_signatures(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  phone TEXT,
  code TEXT NOT NULL,
  verified BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.signature_otp_codes ENABLE ROW LEVEL SECURITY;

-- Public access for the signature flow (validated by token, not JWT)
CREATE POLICY "Public can insert OTP verifications" ON public.signature_otp_codes FOR SELECT USING (true);

-- Table for signature evidence/audit trail
CREATE TABLE public.signature_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_id UUID NOT NULL REFERENCES public.document_signatures(id) ON DELETE CASCADE,
  document_hash TEXT NOT NULL,
  signer_ip TEXT,
  signer_device TEXT,
  signer_location TEXT,
  selfie_url TEXT,
  otp_verified_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  receipt_pdf_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.signature_evidence ENABLE ROW LEVEL SECURITY;

-- Org members can view evidence
CREATE POLICY "Org members can view signature evidence" ON public.signature_evidence
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM document_signatures ds
    JOIN profiles p ON p.organization_id = ds.organization_id
    WHERE ds.id = signature_evidence.signature_id
    AND p.user_id = auth.uid()
  )
);

-- Public insert for the signing flow
CREATE POLICY "Public can insert signature evidence" ON public.signature_evidence
FOR INSERT WITH CHECK (true);

-- Add signature_token to document_signatures if not auto-generated
-- It already exists per the types, just make sure we have an index
CREATE INDEX IF NOT EXISTS idx_signature_otp_codes_signature_id ON public.signature_otp_codes(signature_id);
CREATE INDEX IF NOT EXISTS idx_signature_evidence_signature_id ON public.signature_evidence(signature_id);
CREATE INDEX IF NOT EXISTS idx_document_signatures_signature_token ON public.document_signatures(signature_token);
;
