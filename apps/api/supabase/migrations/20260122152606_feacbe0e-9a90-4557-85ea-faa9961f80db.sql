-- Create flows table
CREATE TABLE public.flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  trigger_type TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'keyword', 'new_conversation', 'webhook'
  trigger_config JSONB DEFAULT '{}'::jsonb,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  variables JSONB DEFAULT '{}'::jsonb,
  triggers_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create flow executions table (for tracking running flows)
CREATE TABLE public.flow_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed', 'paused', 'waiting_input'
  current_node_id TEXT,
  variables JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  execution_log JSONB DEFAULT '[]'::jsonb
);

-- Enable RLS
ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_executions ENABLE ROW LEVEL SECURITY;

-- Flows policies
CREATE POLICY "Users can view flows in their organization"
ON public.flows FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage flows in their organization"
ON public.flows FOR ALL
USING (organization_id = get_user_org_id(auth.uid()));

-- Flow executions policies
CREATE POLICY "Users can view executions in their organization"
ON public.flow_executions FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage executions in their organization"
ON public.flow_executions FOR ALL
USING (organization_id = get_user_org_id(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_flows_updated_at
BEFORE UPDATE ON public.flows
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for flow executions
ALTER PUBLICATION supabase_realtime ADD TABLE public.flow_executions;