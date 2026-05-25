
-- Create agent_folders table
CREATE TABLE public.agent_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_folders ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view agent folders in their org"
ON public.agent_folders FOR SELECT
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create agent folders in their org"
ON public.agent_folders FOR INSERT
WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update agent folders in their org"
ON public.agent_folders FOR UPDATE
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete agent folders in their org"
ON public.agent_folders FOR DELETE
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

-- Add folder_id to ai_agents
ALTER TABLE public.ai_agents ADD COLUMN folder_id UUID REFERENCES public.agent_folders(id) ON DELETE SET NULL;
