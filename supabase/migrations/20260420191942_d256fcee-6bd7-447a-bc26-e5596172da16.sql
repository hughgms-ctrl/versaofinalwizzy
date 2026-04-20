ALTER TABLE public.user_permissions
ADD COLUMN IF NOT EXISTS can_access_operations boolean NOT NULL DEFAULT false;