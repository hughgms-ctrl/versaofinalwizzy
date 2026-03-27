-- Esta migration reforça a exclusão em cascata nas tabelas que referenciam organizations.
-- Isso é necessário para corrigir estados do banco de dados onde a regra de cascade não foi aplicada fisicamente.

-- 1. whatsapp_instances
ALTER TABLE public.whatsapp_instances 
DROP CONSTRAINT IF EXISTS whatsapp_instances_organization_id_fkey;

ALTER TABLE public.whatsapp_instances 
ADD CONSTRAINT whatsapp_instances_organization_id_fkey 
FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2. organization_plans
ALTER TABLE public.organization_plans 
DROP CONSTRAINT IF EXISTS organization_plans_organization_id_fkey;

ALTER TABLE public.organization_plans 
ADD CONSTRAINT organization_plans_organization_id_fkey 
FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 3. profiles
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_organization_id_fkey;

ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_organization_id_fkey 
FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 4. user_roles
ALTER TABLE public.user_roles 
DROP CONSTRAINT IF EXISTS user_roles_organization_id_fkey;

ALTER TABLE public.user_roles 
ADD CONSTRAINT user_roles_organization_id_fkey 
FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 5. contacts
ALTER TABLE public.contacts 
DROP CONSTRAINT IF EXISTS contacts_organization_id_fkey;

ALTER TABLE public.contacts 
ADD CONSTRAINT contacts_organization_id_fkey 
FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 6. conversations
ALTER TABLE public.conversations 
DROP CONSTRAINT IF EXISTS conversations_organization_id_fkey;

ALTER TABLE public.conversations 
ADD CONSTRAINT conversations_organization_id_fkey 
FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 7. organization_usage
ALTER TABLE public.organization_usage 
DROP CONSTRAINT IF EXISTS organization_usage_organization_id_fkey;

ALTER TABLE public.organization_usage 
ADD CONSTRAINT organization_usage_organization_id_fkey 
FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 8. user_fingerprints
ALTER TABLE public.user_fingerprints 
DROP CONSTRAINT IF EXISTS user_fingerprints_organization_id_fkey;

ALTER TABLE public.user_fingerprints 
ADD CONSTRAINT user_fingerprints_organization_id_fkey 
FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
