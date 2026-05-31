DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'billing_events'
      AND policyname = 'Organization owners can read billing events'
  ) THEN
    CREATE POLICY "Organization owners can read billing events"
      ON public.billing_events
      FOR SELECT
      TO authenticated
      USING (
        organization_id = public.get_user_org_id(auth.uid())
        AND (
          public.has_role(auth.uid(), 'owner'::public.app_role)
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
        )
      );
  END IF;
END $$;
