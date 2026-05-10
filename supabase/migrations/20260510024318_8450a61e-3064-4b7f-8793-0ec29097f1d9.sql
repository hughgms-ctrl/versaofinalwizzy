
CREATE TABLE IF NOT EXISTS public.template_fixed_signers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  template_id uuid NOT NULL REFERENCES public.document_templates(id) ON DELETE CASCADE,
  signer_name text NOT NULL,
  signer_email text,
  signer_phone text,
  signer_cpf text,
  signer_role text DEFAULT 'Assinar',
  auth_methods jsonb NOT NULL DEFAULT '{"manuscrita":true,"otp_email":true,"selfie":true}'::jsonb,
  "order" int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tfs_template ON public.template_fixed_signers(template_id);
CREATE INDEX IF NOT EXISTS idx_tfs_org ON public.template_fixed_signers(organization_id);

ALTER TABLE public.template_fixed_signers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view template_fixed_signers" ON public.template_fixed_signers;
CREATE POLICY "Org members can view template_fixed_signers"
ON public.template_fixed_signers FOR SELECT
USING (organization_id = public.get_user_org_id(auth.uid()));

DROP POLICY IF EXISTS "Org members can insert template_fixed_signers" ON public.template_fixed_signers;
CREATE POLICY "Org members can insert template_fixed_signers"
ON public.template_fixed_signers FOR INSERT
WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

DROP POLICY IF EXISTS "Org members can update template_fixed_signers" ON public.template_fixed_signers;
CREATE POLICY "Org members can update template_fixed_signers"
ON public.template_fixed_signers FOR UPDATE
USING (organization_id = public.get_user_org_id(auth.uid()));

DROP POLICY IF EXISTS "Org members can delete template_fixed_signers" ON public.template_fixed_signers;
CREATE POLICY "Org members can delete template_fixed_signers"
ON public.template_fixed_signers FOR DELETE
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE TRIGGER update_tfs_updated_at
BEFORE UPDATE ON public.template_fixed_signers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.generated_documents
  ADD COLUMN IF NOT EXISTS form_filled_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_kind text DEFAULT 'manual';
