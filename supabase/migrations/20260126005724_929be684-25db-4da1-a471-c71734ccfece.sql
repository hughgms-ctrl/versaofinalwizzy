-- Add can_access_scheduled column for Agendamentos module
ALTER TABLE public.user_permissions 
ADD COLUMN IF NOT EXISTS can_access_scheduled boolean NOT NULL DEFAULT false;

-- Update the user_can_access_module function to include scheduled
CREATE OR REPLACE FUNCTION public.user_can_access_module(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT 
        CASE 
            -- Owners and admins always have full access
            WHEN has_role(_user_id, 'owner') OR has_role(_user_id, 'admin') THEN true
            -- Check specific module permission
            WHEN _module = 'conversations' THEN COALESCE((SELECT can_access_conversations FROM user_permissions WHERE user_id = _user_id), false)
            WHEN _module = 'pipeline' THEN COALESCE((SELECT can_access_pipeline FROM user_permissions WHERE user_id = _user_id), false)
            WHEN _module = 'flows' THEN COALESCE((SELECT can_access_flows FROM user_permissions WHERE user_id = _user_id), false)
            WHEN _module = 'reports' THEN COALESCE((SELECT can_access_reports FROM user_permissions WHERE user_id = _user_id), false)
            WHEN _module = 'agents' THEN COALESCE((SELECT can_access_agents FROM user_permissions WHERE user_id = _user_id), false)
            WHEN _module = 'settings' THEN COALESCE((SELECT can_access_settings FROM user_permissions WHERE user_id = _user_id), false)
            WHEN _module = 'team' THEN COALESCE((SELECT can_access_team FROM user_permissions WHERE user_id = _user_id), false)
            WHEN _module = 'scheduled' THEN COALESCE((SELECT can_access_scheduled FROM user_permissions WHERE user_id = _user_id), false)
            ELSE false
        END
$$;