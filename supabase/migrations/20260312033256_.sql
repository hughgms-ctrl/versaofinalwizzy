-- Create document_folders table
CREATE TABLE public.document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  position integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage document folders in their org"
  ON public.document_folders FOR ALL
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can view document folders in their org"
  ON public.document_folders FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

-- Add folder_id to document_templates
ALTER TABLE public.document_templates ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.document_folders(id) ON DELETE SET NULL;

-- Add folder_id to document_packs  
ALTER TABLE public.document_packs ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.document_folders(id) ON DELETE SET NULL;

-- Trigger for updated_at
CREATE TRIGGER update_document_folders_updated_at
  BEFORE UPDATE ON public.document_folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();;
