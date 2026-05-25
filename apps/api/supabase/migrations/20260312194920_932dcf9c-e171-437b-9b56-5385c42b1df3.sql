
ALTER TABLE public.user_permissions 
  ADD COLUMN IF NOT EXISTS can_access_dashboard boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_access_calendar boolean NOT NULL DEFAULT true;
