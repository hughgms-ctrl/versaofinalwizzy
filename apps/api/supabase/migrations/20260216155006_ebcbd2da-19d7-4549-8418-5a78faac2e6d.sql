
-- Table: document_templates
CREATE TABLE public.document_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  content TEXT NOT NULL DEFAULT '',
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  original_file_url TEXT,
  workspace_id UUID REFERENCES public.workspaces(id),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view document templates in their org"
  ON public.document_templates FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage document templates in their org"
  ON public.document_templates FOR ALL
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE TRIGGER update_document_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table: document_packs
CREATE TABLE public.document_packs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  template_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  workspace_id UUID REFERENCES public.workspaces(id),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.document_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view document packs in their org"
  ON public.document_packs FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage document packs in their org"
  ON public.document_packs FOR ALL
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE TRIGGER update_document_packs_updated_at
  BEFORE UPDATE ON public.document_packs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table: generated_documents
CREATE TABLE public.generated_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  template_id UUID REFERENCES public.document_templates(id),
  pack_id UUID REFERENCES public.document_packs(id),
  contact_id UUID REFERENCES public.contacts(id),
  conversation_id UUID REFERENCES public.conversations(id),
  name TEXT NOT NULL,
  filled_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  signing_method TEXT,
  signing_status TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view generated documents in their org"
  ON public.generated_documents FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage generated documents in their org"
  ON public.generated_documents FOR ALL
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE TRIGGER update_generated_documents_updated_at
  BEFORE UPDATE ON public.generated_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
