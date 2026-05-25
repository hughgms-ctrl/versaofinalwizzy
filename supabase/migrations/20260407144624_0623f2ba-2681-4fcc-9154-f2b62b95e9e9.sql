-- Add price_yearly and allowed_modules to platform_plans
ALTER TABLE public.platform_plans 
  ADD COLUMN IF NOT EXISTS price_yearly numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allowed_modules jsonb DEFAULT '[]'::jsonb;

-- Rename stripe fields to asaas and add billing_cycle in organization_plans
ALTER TABLE public.organization_plans 
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS billing_cycle text DEFAULT 'monthly';

-- Create billing_events table for webhook audit
CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  event_type text NOT NULL,
  asaas_event_id text,
  payload jsonb DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can read billing_events"
  ON public.billing_events FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));