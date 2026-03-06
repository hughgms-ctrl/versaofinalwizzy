-- Function to increment campaign trigger count
CREATE OR REPLACE FUNCTION public.increment_campaign_count(campaign_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.campaigns
    SET trigger_count = trigger_count + 1,
        updated_at = now()
    WHERE id = campaign_id;
END;
$$;
