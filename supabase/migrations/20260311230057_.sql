
-- Governance Certifications
CREATE TABLE IF NOT EXISTS public.governance_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score integer NOT NULL,
  security_score integer NOT NULL,
  status text NOT NULL DEFAULT 'issued',
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text,
  snapshot jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.governance_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage certifications"
  ON public.governance_certifications FOR ALL
  USING (is_platform_admin(auth.uid()));

-- Governance Action Logs
CREATE TABLE IF NOT EXISTS public.governance_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_name text,
  details jsonb DEFAULT '{}'::jsonb,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.governance_action_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage governance logs"
  ON public.governance_action_logs FOR ALL
  USING (is_platform_admin(auth.uid()));

-- Governance Score History
CREATE TABLE IF NOT EXISTS public.governance_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_score integer NOT NULL,
  security_score integer NOT NULL DEFAULT 0,
  backend_score integer NOT NULL DEFAULT 0,
  continuity_score integer NOT NULL DEFAULT 0,
  help_score integer NOT NULL DEFAULT 0,
  ux_score integer NOT NULL DEFAULT 0,
  governance_dim_score integer NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.governance_score_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage score history"
  ON public.governance_score_history FOR ALL
  USING (is_platform_admin(auth.uid()));
;
