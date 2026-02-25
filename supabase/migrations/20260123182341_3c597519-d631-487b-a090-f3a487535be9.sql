-- Table to store user permissions for each area/feature
CREATE TABLE public.user_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    
    -- Module access (if false, module is hidden)
    can_access_conversations boolean NOT NULL DEFAULT false,
    can_access_pipeline boolean NOT NULL DEFAULT false,
    can_access_flows boolean NOT NULL DEFAULT false,
    can_access_reports boolean NOT NULL DEFAULT false,
    can_access_agents boolean NOT NULL DEFAULT false,
    can_access_settings boolean NOT NULL DEFAULT false,
    
    -- Conversations restrictions
    conversations_filter_type text NOT NULL DEFAULT 'all', -- 'all', 'assigned', 'tags', 'assigned_and_tags'
    conversations_allowed_tags uuid[] DEFAULT '{}',
    
    -- Pipeline restrictions
    pipeline_access_type text NOT NULL DEFAULT 'all', -- 'all', 'specific'
    allowed_pipeline_ids uuid[] DEFAULT '{}',
    
    -- Timestamps
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    
    UNIQUE (user_id, organization_id)
);

-- Enable RLS
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Owners and admins can manage permissions
CREATE POLICY "Owners and admins can manage permissions"
ON public.user_permissions
FOR ALL
USING (
    organization_id = get_user_org_id(auth.uid()) 
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'))
);

-- Users can view their own permissions
CREATE POLICY "Users can view their own permissions"
ON public.user_permissions
FOR SELECT
USING (user_id = auth.uid());

-- Users can view all permissions in their org (for admins listing)
CREATE POLICY "Users can view org permissions"
ON public.user_permissions
FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_user_permissions_updated_at
BEFORE UPDATE ON public.user_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to check if user has access to a module
CREATE OR REPLACE FUNCTION public.user_can_access_module(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
            ELSE false
        END
$$;