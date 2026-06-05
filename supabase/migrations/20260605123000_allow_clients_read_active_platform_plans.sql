CREATE POLICY IF NOT EXISTS "Authenticated users can read active platform plans"
  ON public.platform_plans
  FOR SELECT
  TO authenticated
  USING (is_active = true);
