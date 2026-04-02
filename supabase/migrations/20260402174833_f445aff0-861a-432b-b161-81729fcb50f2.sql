-- Create cron job to process scheduled messages every minute
SELECT cron.schedule(
  'process-scheduled-messages',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/process-scheduled-messages',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);