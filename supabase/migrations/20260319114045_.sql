SELECT cron.schedule(
  'process-campaign-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
      url:='https://zaobtetbjpuzibjymhzw.supabase.co/functions/v1/process-campaign-queue',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphb2J0ZXRianB1emlianltaHp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMzc5MzksImV4cCI6MjA4NzcxMzkzOX0.HBUI1OK1eYq9FE2SzIvuAkxuCG0frApCQZqcjjDx43k"}'::jsonb,
      body:=concat('{"time": "', now(), '"}')::jsonb
  ) as request_id;
  $$
);;
