CREATE TABLE IF NOT EXISTS public.entry_flow_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  description text,
  primary_metric text NOT NULL DEFAULT 'payment_completed',
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entry_flow_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.entry_flow_experiments(id) ON DELETE CASCADE,
  name text NOT NULL,
  flow_type text NOT NULL,
  traffic_percent integer NOT NULL DEFAULT 50 CHECK (traffic_percent >= 0 AND traffic_percent <= 100),
  is_control boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entry_flow_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.entry_flow_experiments(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.entry_flow_variants(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  user_id uuid,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, visitor_id)
);

CREATE TABLE IF NOT EXISTS public.entry_flow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid REFERENCES public.entry_flow_experiments(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.entry_flow_variants(id) ON DELETE SET NULL,
  visitor_id text,
  user_id uuid,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entry_flow_experiments_status ON public.entry_flow_experiments(status);
CREATE INDEX IF NOT EXISTS idx_entry_flow_variants_experiment ON public.entry_flow_variants(experiment_id);
CREATE INDEX IF NOT EXISTS idx_entry_flow_assignments_visitor ON public.entry_flow_assignments(visitor_id);
CREATE INDEX IF NOT EXISTS idx_entry_flow_events_experiment ON public.entry_flow_events(experiment_id, variant_id, event_name);
CREATE INDEX IF NOT EXISTS idx_entry_flow_events_created ON public.entry_flow_events(created_at);

ALTER TABLE public.entry_flow_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_flow_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_flow_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_flow_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage entry flow experiments"
  ON public.entry_flow_experiments FOR ALL
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Public can read active entry flow experiments"
  ON public.entry_flow_experiments FOR SELECT
  USING (status = 'active');

CREATE POLICY "Platform admins manage entry flow variants"
  ON public.entry_flow_variants FOR ALL
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Public can read active entry flow variants"
  ON public.entry_flow_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.entry_flow_experiments e
      WHERE e.id = entry_flow_variants.experiment_id
        AND e.status = 'active'
    )
  );

CREATE POLICY "Platform admins read entry flow assignments"
  ON public.entry_flow_assignments FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins read entry flow events"
  ON public.entry_flow_events FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

INSERT INTO public.platform_settings (key, value)
VALUES (
  'entry_flow_settings',
  '{
    "ab_testing_enabled": false,
    "default_flow_type": "signup_first_payment_after",
    "default_redirect": "/auth",
    "persist_assignment_days": 30
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
