
-- Table to track individual signature requests
CREATE TABLE public.document_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  generated_document_id UUID NOT NULL REFERENCES public.generated_documents(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id),
  conversation_id UUID REFERENCES public.conversations(id),
  signer_name TEXT,
  signer_email TEXT,
  signer_phone TEXT,
  signer_cpf TEXT,
  signing_method TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'govbr', 'zapsign'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'opened', 'signed', 'rejected', 'expired'
  signature_url TEXT, -- public page URL for gov.br or zapsign link
  signed_pdf_url TEXT, -- URL of the signed document
  external_id TEXT, -- ZapSign document ID or gov.br reference
  metadata JSONB DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view signatures in their org"
  ON public.document_signatures FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage signatures in their org"
  ON public.document_signatures FOR ALL
  USING (organization_id = get_user_org_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_document_signatures_updated_at
  BEFORE UPDATE ON public.document_signatures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add signing_method to generated_documents if not already present (it exists but let's ensure consistency)
-- Also add a default_signing_method to document_templates for pre-configuration
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS default_signing_method TEXT DEFAULT 'manual';
