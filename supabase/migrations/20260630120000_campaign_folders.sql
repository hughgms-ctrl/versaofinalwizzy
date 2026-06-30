-- Create campaign_folders table (mirrors flow_folders, used to organize campaigns into folders)
CREATE TABLE public.campaign_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.campaign_folders(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  workspace_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Link campaigns to a folder + give them a position for ordering
ALTER TABLE public.campaigns
ADD COLUMN folder_id UUID REFERENCES public.campaign_folders(id) ON DELETE SET NULL;

ALTER TABLE public.campaigns
ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Enable RLS
ALTER TABLE public.campaign_folders ENABLE ROW LEVEL SECURITY;

-- Policies (org-scoped, same shape as flow_folders)
CREATE POLICY "Users can view campaign folders in their organization"
ON public.campaign_folders
FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage campaign folders in their organization"
ON public.campaign_folders
FOR ALL
USING (organization_id = get_user_org_id(auth.uid()));

-- Indexes for performance
CREATE INDEX idx_campaigns_folder_id ON public.campaigns(folder_id);
CREATE INDEX idx_campaigns_position ON public.campaigns(position);
CREATE INDEX idx_campaign_folders_organization_id ON public.campaign_folders(organization_id);
CREATE INDEX idx_campaign_folders_parent_id ON public.campaign_folders(parent_id);
CREATE INDEX idx_campaign_folders_position ON public.campaign_folders(position);
CREATE INDEX idx_campaign_folders_workspace_ids ON public.campaign_folders USING GIN(workspace_ids);

-- Keep updated_at fresh
CREATE TRIGGER update_campaign_folders_updated_at
BEFORE UPDATE ON public.campaign_folders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
