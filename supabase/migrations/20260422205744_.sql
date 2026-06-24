
-- Tabela de regras de qualificação por agente
CREATE TABLE public.agent_qualification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  label text NOT NULL,
  criteria text NOT NULL,
  requires_all boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_agent_qualification_rules_agent ON public.agent_qualification_rules(agent_id);
CREATE INDEX idx_agent_qualification_rules_org ON public.agent_qualification_rules(organization_id);

ALTER TABLE public.agent_qualification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rules in their org"
ON public.agent_qualification_rules FOR SELECT
USING (organization_id = public.get_user_org_id(auth.uid()) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Users can manage rules in their org"
ON public.agent_qualification_rules FOR ALL
USING (organization_id = public.get_user_org_id(auth.uid()) OR public.is_platform_admin(auth.uid()))
WITH CHECK (organization_id = public.get_user_org_id(auth.uid()) OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER update_agent_qualification_rules_updated_at
BEFORE UPDATE ON public.agent_qualification_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
;
