
-- Create agent_execution_logs table for auditing AI orchestrator executions
CREATE TABLE public.agent_execution_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  master_prompt_id uuid REFERENCES public.master_prompts(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  input_message text NOT NULL,
  ai_response text,
  tools_executed jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  execution_time_ms integer
);

-- Enable RLS
ALTER TABLE public.agent_execution_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view execution logs in their org"
  ON public.agent_execution_logs
  FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage execution logs"
  ON public.agent_execution_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for performance
CREATE INDEX idx_agent_execution_logs_conversation ON public.agent_execution_logs(conversation_id);
CREATE INDEX idx_agent_execution_logs_created ON public.agent_execution_logs(created_at DESC);
