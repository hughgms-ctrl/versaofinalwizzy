-- Create flow_node_logs table to track internal flow steps
CREATE TABLE IF NOT EXISTS public.flow_node_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  flow_execution_id uuid REFERENCES public.flow_executions(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  node_name text,
  node_type text,
  input_data jsonb DEFAULT '{}'::jsonb,
  output_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.flow_node_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view flow node logs in their org"
  ON public.flow_node_logs
  FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage flow node logs"
  ON public.flow_node_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_flow_node_logs_conversation ON public.flow_node_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_flow_node_logs_execution ON public.flow_node_logs(flow_execution_id);
CREATE INDEX IF NOT EXISTS idx_flow_node_logs_created ON public.flow_node_logs(created_at DESC);
