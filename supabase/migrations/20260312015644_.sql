-- Fix schema/function mismatch for global platform admin role
-- user_roles.organization_id must allow NULL for global role rows
ALTER TABLE public.user_roles
ALTER COLUMN organization_id DROP NOT NULL;

-- Enforce correct scope by role (security hardening)
CREATE OR REPLACE FUNCTION public.validate_user_roles_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'platform_admin' AND NEW.organization_id IS NOT NULL THEN
    RAISE EXCEPTION 'platform_admin role must have organization_id = NULL';
  END IF;

  IF NEW.role <> 'platform_admin' AND NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'organization-scoped roles must have organization_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_user_roles_scope_trigger ON public.user_roles;
CREATE TRIGGER validate_user_roles_scope_trigger
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.validate_user_roles_scope();

-- Normalize existing data so current platform admins can authenticate
UPDATE public.user_roles
SET organization_id = NULL
WHERE role = 'platform_admin'
  AND organization_id IS NOT NULL;;
