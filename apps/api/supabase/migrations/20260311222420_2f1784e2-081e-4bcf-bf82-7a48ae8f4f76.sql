
-- Create is_platform_admin function
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'platform_admin'
  )
$$;

-- Storage fields on organizations
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS storage_limit_bytes bigint DEFAULT 1073741824,
ADD COLUMN IF NOT EXISTS storage_used_bytes bigint DEFAULT 0;

-- Tables
CREATE TABLE IF NOT EXISTS public.platform_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, slug text NOT NULL UNIQUE,
  price_monthly numeric NOT NULL DEFAULT 0,
  ai_mode text NOT NULL DEFAULT 'own_api',
  storage_limit_bytes bigint NOT NULL DEFAULT 1073741824,
  max_conversations integer, max_team_members integer NOT NULL DEFAULT 5,
  max_ai_requests_month integer, features jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.organization_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  plan_id uuid NOT NULL REFERENCES public.platform_plans(id),
  status text NOT NULL DEFAULT 'trial', trial_ends_at timestamptz,
  current_period_start timestamptz, current_period_end timestamptz,
  payment_status text NOT NULL DEFAULT 'pending',
  stripe_customer_id text, stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.platform_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL, api_key_encrypted text NOT NULL,
  is_active boolean NOT NULL DEFAULT true, monthly_budget numeric DEFAULT 0,
  current_month_cost numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.organization_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period text NOT NULL, storage_bytes bigint DEFAULT 0,
  messages_sent integer DEFAULT 0, messages_received integer DEFAULT 0,
  ai_requests integer DEFAULT 0, ai_cost_usd numeric DEFAULT 0,
  contacts_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, period)
);
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL, entity_type text NOT NULL, entity_id text,
  performed_by uuid REFERENCES auth.users(id), details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.governance_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase text NOT NULL, name text NOT NULL, description text,
  weight numeric NOT NULL DEFAULT 1, is_blocker boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending', notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.governance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score_total numeric NOT NULL DEFAULT 0, score_security numeric DEFAULT 0,
  score_backend numeric DEFAULT 0, score_continuity numeric DEFAULT 0,
  score_help numeric DEFAULT 0, score_ux numeric DEFAULT 0,
  score_governance numeric DEFAULT 0, risk_level text DEFAULT 'low',
  is_certified boolean DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.governance_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, category text NOT NULL, content text NOT NULL,
  criticality text NOT NULL DEFAULT 'medium', status text NOT NULL DEFAULT 'draft',
  related_files text[], related_tables text[], related_functions text[],
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.governance_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id uuid NOT NULL REFERENCES public.governance_prompts(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1, content text NOT NULL,
  changed_by uuid REFERENCES auth.users(id), reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_prompt_versions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Platform admins full access" ON public.platform_plans FOR ALL USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins full access" ON public.organization_plans FOR ALL USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins full access" ON public.platform_api_keys FOR ALL USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins full access" ON public.organization_usage FOR ALL USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins full access" ON public.admin_audit_logs FOR ALL USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins full access" ON public.governance_checks FOR ALL USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins full access" ON public.governance_snapshots FOR ALL USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins full access" ON public.governance_prompts FOR ALL USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins full access" ON public.governance_prompt_versions FOR ALL USING (public.is_platform_admin(auth.uid()));

-- Seed plans
INSERT INTO public.platform_plans (name, slug, price_monthly, ai_mode, storage_limit_bytes, max_team_members, max_ai_requests_month) VALUES
('Básico', 'basic', 97, 'own_api', 1073741824, 3, NULL),
('Profissional', 'pro', 197, 'own_api', 10737418240, 10, NULL),
('Enterprise', 'enterprise', 497, 'platform_api', 53687091200, 50, 10000)
ON CONFLICT (slug) DO NOTHING;
