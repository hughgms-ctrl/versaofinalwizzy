ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS start_time TEXT DEFAULT '00:00',
ADD COLUMN IF NOT EXISTS end_time TEXT DEFAULT '23:59';

UPDATE public.campaigns 
SET 
  start_time = LPAD(start_hour::text, 2, '0') || ':00',
  end_time = LPAD(end_hour::text, 2, '0') || ':59'
WHERE start_hour IS NOT NULL AND end_hour IS NOT NULL;

ALTER TABLE public.campaigns 
DROP COLUMN IF EXISTS start_hour,
DROP COLUMN IF EXISTS end_hour;;
