
-- Table for structured AI training rules
CREATE TABLE public.agent_training_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Where this rule applies
  target_type text NOT NULL CHECK (target_type IN ('agent', 'master_prompt', 'flow_node')),
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  master_prompt_id uuid REFERENCES public.master_prompts(id) ON DELETE CASCADE,
  flow_id uuid REFERENCES public.flows(id) ON DELETE CASCADE,
  node_id text,
  
  -- The rule content
  situation text NOT NULL,
  rule text NOT NULL,
  original_message text,
  original_feedback text,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  
  -- Status
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_training_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view training rules in their org"
  ON public.agent_training_rules FOR SELECT
  TO public
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage training rules in their org"
  ON public.agent_training_rules FOR ALL
  TO public
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Service role can manage training rules"
  ON public.agent_training_rules FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_training_rules_agent ON public.agent_training_rules(agent_id) WHERE is_active = true;
CREATE INDEX idx_training_rules_master ON public.agent_training_rules(master_prompt_id) WHERE is_active = true;
CREATE INDEX idx_training_rules_flow ON public.agent_training_rules(flow_id, node_id) WHERE is_active = true;
