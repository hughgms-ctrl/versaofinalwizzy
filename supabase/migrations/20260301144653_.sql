
-- Create CRM entries table for dual storage (Supabase + UAZAPI)
CREATE TABLE public.crm_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_to_uazapi BOOLEAN NOT NULL DEFAULT false,
  uazapi_crm_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_entries ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view CRM entries in their org"
  ON public.crm_entries FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage CRM entries in their org"
  ON public.crm_entries FOR ALL
  USING (organization_id = get_user_org_id(auth.uid()));

-- Index
CREATE INDEX idx_crm_entries_contact ON public.crm_entries(contact_id);
CREATE INDEX idx_crm_entries_org ON public.crm_entries(organization_id);

-- Trigger for updated_at
CREATE TRIGGER update_crm_entries_updated_at
  BEFORE UPDATE ON public.crm_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
;
