
CREATE TABLE public.agent_function_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_function_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org roles" ON public.agent_function_roles
  FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert roles" ON public.agent_function_roles
  FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete roles" ON public.agent_function_roles
  FOR DELETE USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update roles" ON public.agent_function_roles
  FOR UPDATE USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE UNIQUE INDEX idx_agent_function_roles_org_value ON public.agent_function_roles(organization_id, value);
