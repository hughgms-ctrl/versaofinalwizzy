
-- Add user_id and display_name to calendar_configs
ALTER TABLE public.calendar_configs 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS display_name text;

-- Drop old unique constraint on organization_id and add new one
ALTER TABLE public.calendar_configs DROP CONSTRAINT IF EXISTS calendar_configs_organization_id_key;
ALTER TABLE public.calendar_configs ADD CONSTRAINT calendar_configs_org_user_unique UNIQUE (organization_id, user_id);

-- Add assigned_user_id and meet_link to calendar_bookings
ALTER TABLE public.calendar_bookings
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS meet_link text;
