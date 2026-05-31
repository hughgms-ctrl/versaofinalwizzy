DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_usage'
      AND policyname = 'Users can view own organization usage'
  ) THEN
    CREATE POLICY "Users can view own organization usage"
    ON public.organization_usage
    FOR SELECT
    USING (organization_id = public.get_user_org_id(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_plans'
      AND policyname = 'Users can view own organization plan'
  ) THEN
    CREATE POLICY "Users can view own organization plan"
    ON public.organization_plans
    FOR SELECT
    USING (organization_id = public.get_user_org_id(auth.uid()));
  END IF;
END $$;

INSERT INTO public.platform_plans (
  name,
  slug,
  price_monthly,
  price_yearly,
  ai_mode,
  storage_limit_bytes,
  max_team_members,
  max_ai_requests_month,
  allowed_modules,
  features,
  is_active
) VALUES (
  'Max',
  'max',
  997,
  9970,
  'platform_api',
  107374182400,
  100,
  NULL,
  '["documents", "widgets", "quiz"]'::jsonb,
  '{}'::jsonb,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  ai_mode = EXCLUDED.ai_mode,
  allowed_modules = EXCLUDED.allowed_modules,
  updated_at = now();
