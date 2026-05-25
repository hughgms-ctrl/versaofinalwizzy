
-- Filler signing config columns on document_templates
ALTER TABLE public.document_templates
  ADD COLUMN IF NOT EXISTS filler_signs boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS filler_auth_methods jsonb NOT NULL DEFAULT '{"manuscrita": true, "otp_email": true, "otp_whatsapp": false, "selfie": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS filler_field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Same for document_packs
ALTER TABLE public.document_packs
  ADD COLUMN IF NOT EXISTS filler_signs boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS filler_auth_methods jsonb NOT NULL DEFAULT '{"manuscrita": true, "otp_email": true, "otp_whatsapp": false, "selfie": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS filler_field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Pack fixed signers (mirror of template_fixed_signers)
CREATE TABLE IF NOT EXISTS public.pack_fixed_signers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  pack_id uuid NOT NULL REFERENCES public.document_packs(id) ON DELETE CASCADE,
  signer_name text NOT NULL,
  signer_email text,
  signer_phone text,
  signer_cpf text,
  signer_role text DEFAULT 'Assinar',
  auth_methods jsonb NOT NULL DEFAULT '{"manuscrita": true, "otp_email": true, "selfie": true}'::jsonb,
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pack_fixed_signers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view pack fixed signers"
  ON public.pack_fixed_signers FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Members can insert pack fixed signers"
  ON public.pack_fixed_signers FOR INSERT
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Members can update pack fixed signers"
  ON public.pack_fixed_signers FOR UPDATE
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Members can delete pack fixed signers"
  ON public.pack_fixed_signers FOR DELETE
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE TRIGGER trg_pack_fixed_signers_updated_at
  BEFORE UPDATE ON public.pack_fixed_signers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_pack_fixed_signers_pack ON public.pack_fixed_signers(pack_id);
