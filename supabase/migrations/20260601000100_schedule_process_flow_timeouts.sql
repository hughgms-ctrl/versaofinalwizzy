-- Process flow waiting_input timeouts every minute.
-- This job sends configured follow-ups and routes timeout/responded edges.
SELECT cron.unschedule('process-flow-timeouts')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'process-flow-timeouts'
);

SELECT cron.schedule(
  'process-flow-timeouts',
  '* * * * *',
  $$
  SELECT net.http_post(
      url:='https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/process-flow-timeouts',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emlianltaHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzc5MzksImV4cCI6MjA4NzcxMzkzOX0.HBUI1OK1eYq9FE2SzIvuAkxuCG0frApCQZqcjjDx43k"}'::jsonb,
      body:=concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $$
);
