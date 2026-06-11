CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    new_org_id uuid;
    invited_org_id uuid;
    invited_role public.app_role;
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

    IF NEW.raw_user_meta_data ? 'invited_organization_id' THEN
      invited_org_id := (NEW.raw_user_meta_data->>'invited_organization_id')::uuid;
      invited_role := COALESCE((NEW.raw_user_meta_data->>'invited_role')::public.app_role, 'agent'::public.app_role);

      IF EXISTS (SELECT 1 FROM public.organizations WHERE id = invited_org_id) THEN
        INSERT INTO public.profiles (user_id, organization_id, full_name, phone)
        VALUES (
          NEW.id,
          invited_org_id,
          COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
          NULLIF(_phone, '')
        );

        INSERT INTO public.user_roles (user_id, organization_id, role)
        VALUES (NEW.id, invited_org_id, invited_role);

        INSERT INTO public.organization_members (organization_id, user_id, role)
        VALUES (invited_org_id, NEW.id, invited_role)
        ON CONFLICT (organization_id, user_id) DO UPDATE
        SET role = EXCLUDED.role,
            updated_at = now();

        RETURN NEW;
      END IF;
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
