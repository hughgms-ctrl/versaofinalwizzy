
-- Drop the restrictive unique constraint and replace with (user_id, role)
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_organization_id_key;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

-- Now insert platform_admin role
INSERT INTO public.user_roles (user_id, organization_id, role) 
VALUES ('0e92cdac-e0fc-48eb-882f-8d187fb54bba', '48dcff79-3168-4ec9-9ce3-68597dcf2238', 'platform_admin'::app_role);
;
