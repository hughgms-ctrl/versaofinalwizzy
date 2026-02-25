
-- Table to store AI integration configs per organization
CREATE TABLE public.integration_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Default AI provider: 'lovable', 'openai', 'gemini'
  ai_provider TEXT NOT NULL DEFAULT 'lovable',
  
  -- Default model per provider
  default_model TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  
  -- API Keys (stored encrypted-like, RLS protects access)
  openai_api_key TEXT,
  gemini_api_key TEXT,
  
  -- Per-feature provider overrides (null = use default)
  agents_provider TEXT,
  agents_model TEXT,
  conversation_summary_provider TEXT,
  conversation_summary_model TEXT,
  prompt_generation_provider TEXT,
  prompt_generation_model TEXT,
  flow_generation_provider TEXT,
  flow_generation_model TEXT,
  transcription_provider TEXT,
  transcription_model TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_org_integration UNIQUE (organization_id)
);

-- Enable RLS
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;

-- Only admins/owners can manage integration configs
CREATE POLICY "Admins can manage integration configs"
  ON public.integration_configs
  FOR ALL
  USING (
    (organization_id = get_user_org_id(auth.uid())) 
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "Users can view integration configs in their org"
  ON public.integration_configs
  FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_integration_configs_updated_at
  BEFORE UPDATE ON public.integration_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
