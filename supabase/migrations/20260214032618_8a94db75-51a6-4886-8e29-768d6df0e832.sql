
-- Add new fields to ai_agents table
ALTER TABLE public.ai_agents 
  ADD COLUMN IF NOT EXISTS function_role text DEFAULT 'recepcao',
  ADD COLUMN IF NOT EXISTS prompt_base text DEFAULT '',
  ADD COLUMN IF NOT EXISTS tag_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pipeline_column_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS flow_ids uuid[] DEFAULT '{}';

-- Create master_prompts table
CREATE TABLE public.master_prompts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  workspace_id uuid REFERENCES public.workspaces(id),
  name text NOT NULL,
  niche text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  agent_sequence jsonb DEFAULT '[]'::jsonb,
  agent_rules jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.master_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage master prompts in their org"
  ON public.master_prompts FOR ALL
  USING (
    organization_id = get_user_org_id(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Users can view master prompts in their org"
  ON public.master_prompts FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE TRIGGER update_master_prompts_updated_at
  BEFORE UPDATE ON public.master_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create workspace_agent_config table for agent-workspace assignments
CREATE TABLE public.workspace_agent_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  agent_ids uuid[] DEFAULT '{}',
  master_prompt_id uuid REFERENCES public.master_prompts(id) ON DELETE SET NULL,
  ai_provider text DEFAULT 'lovable',
  ai_model text DEFAULT 'google/gemini-3-flash-preview',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(workspace_id)
);

ALTER TABLE public.workspace_agent_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage workspace agent configs"
  ON public.workspace_agent_configs FOR ALL
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Users can view workspace agent configs"
  ON public.workspace_agent_configs FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE TRIGGER update_workspace_agent_configs_updated_at
  BEFORE UPDATE ON public.workspace_agent_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
