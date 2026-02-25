-- Add team access permission column
ALTER TABLE public.user_permissions 
ADD COLUMN can_access_team boolean NOT NULL DEFAULT false;