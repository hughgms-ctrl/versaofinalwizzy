-- Update handle_new_user to block signups at app_metadata level when disabled
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
BEGIN
    -- Check if signups are allowed
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

    -- If signups are not allowed, mark user as pending approval in BOTH metadata fields
    -- raw_app_meta_data is what we use to block access at the application level
    IF NOT COALESCE(_allow_signups, true) THEN
        NEW.raw_user_meta_data := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb) || '{"pending_approval": true}'::jsonb;
        NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) || '{"pending_approval": true}'::jsonb;
    END IF;
    
    RETURN NEW;
END;
$function$;

-- Retroactively mark Eder Cibin as pending approval
UPDATE auth.users
SET 
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"pending_approval": true}'::jsonb,
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"pending_approval": true}'::jsonb
WHERE id = '0a01457e-8137-4dae-85be-55ac6ee1d267';