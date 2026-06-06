CREATE TABLE IF NOT EXISTS public.blocked_auth_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone text,
  reason text,
  source_organization_id uuid,
  source_user_id uuid,
  blocked_by uuid,
  blocked_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocked_auth_identifiers_has_identifier CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_auth_identifiers_email
ON public.blocked_auth_identifiers (email)
WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_blocked_auth_identifiers_phone
ON public.blocked_auth_identifiers (phone)
WHERE phone IS NOT NULL;

ALTER TABLE public.blocked_auth_identifiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins full access on blocked_auth_identifiers"
ON public.blocked_auth_identifiers;

CREATE POLICY "Platform admins full access on blocked_auth_identifiers"
ON public.blocked_auth_identifiers
FOR ALL
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    new_org_id uuid;
    org_slug text;
    _allow_signups boolean;
    _email text;
    _phone text;
BEGIN
    _email := lower(trim(COALESCE(NEW.email, '')));
    _phone := regexp_replace(COALESCE(NEW.raw_user_meta_data->>'phone', ''), '\D', '', 'g');

    IF EXISTS (
      SELECT 1
      FROM public.blocked_auth_identifiers bai
      WHERE (bai.email IS NOT NULL AND lower(bai.email) = _email)
         OR (_phone <> '' AND bai.phone IS NOT NULL AND bai.phone = _phone)
    ) THEN
      RAISE EXCEPTION 'Cadastro bloqueado para este e-mail ou telefone.'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE((value)::boolean, true) INTO _allow_signups
    FROM public.platform_settings WHERE key = 'allow_signups';

    org_slug := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9]', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 8);
    
    INSERT INTO public.organizations (name, slug, timezone)
    VALUES (
        COALESCE(NEW.raw_user_meta_data->>'company_name', split_part(NEW.email, '@', 1) || '''s Organization'),
        org_slug,
        COALESCE(NEW.raw_user_meta_data->>'timezone', 'America/Sao_Paulo')
    )
    RETURNING id INTO new_org_id;
    
    INSERT INTO public.profiles (user_id, organization_id, full_name)
    VALUES (
        NEW.id,
        new_org_id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
    
    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (NEW.id, new_org_id, 'owner');
    
    INSERT INTO public.whatsapp_instances (organization_id, status, label)
    VALUES (new_org_id, 'pending', 'Principal');

    IF NOT COALESCE(_allow_signups, true) THEN
        NEW.raw_user_meta_data := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb) || '{"pending_approval": true}'::jsonb;
        NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) || '{"pending_approval": true}'::jsonb;
    END IF;
    
    RETURN NEW;
END;
$function$;
