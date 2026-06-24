CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    new_org_id uuid;
    org_slug text;
BEGIN
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
    
    RETURN NEW;
END;
$function$;;
