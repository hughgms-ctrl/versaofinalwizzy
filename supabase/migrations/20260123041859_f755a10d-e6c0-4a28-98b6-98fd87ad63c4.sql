-- Create flow_folders table
CREATE TABLE public.flow_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.flow_folders(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add folder_id to flows table
ALTER TABLE public.flows 
ADD COLUMN folder_id UUID REFERENCES public.flow_folders(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.flow_folders ENABLE ROW LEVEL SECURITY;

-- Create policies for flow_folders
CREATE POLICY "Users can view folders in their organization"
ON public.flow_folders
FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage folders in their organization"
ON public.flow_folders
FOR ALL
USING (organization_id = get_user_org_id(auth.uid()));

-- Create index for performance
CREATE INDEX idx_flows_folder_id ON public.flows(folder_id);
CREATE INDEX idx_flow_folders_organization_id ON public.flow_folders(organization_id);
CREATE INDEX idx_flow_folders_parent_id ON public.flow_folders(parent_id);

-- Create trigger for updated_at
CREATE TRIGGER update_flow_folders_updated_at
BEFORE UPDATE ON public.flow_folders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();