-- Fix function search_path for remaining functions
CREATE OR REPLACE FUNCTION public.increment_campaign_count(campaign_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE campaigns SET trigger_count = trigger_count + 1 WHERE id = campaign_id;
$$;;
