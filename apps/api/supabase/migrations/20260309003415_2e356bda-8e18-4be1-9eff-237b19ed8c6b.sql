-- Create function to trigger campaign when tag is added
CREATE OR REPLACE FUNCTION public.handle_contact_tag_added_campaign()
RETURNS trigger AS $$
DECLARE
  _request_id bigint;
  _url text;
  _key text;
BEGIN
  _url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/trigger-campaign-on-tag';
  
  -- Use pg_net to call the edge function
  -- We use the record format
  SELECT net.http_post(
      url := _url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := json_build_object('record', row_to_json(NEW))::jsonb
  ) INTO _request_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_contact_tag_added_campaign ON public.contact_tags;

-- Create trigger
CREATE TRIGGER on_contact_tag_added_campaign
  AFTER INSERT ON public.contact_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_contact_tag_added_campaign();