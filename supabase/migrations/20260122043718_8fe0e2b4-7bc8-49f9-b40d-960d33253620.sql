-- Create trigger function for new user registration
-- Automatically creates organization, profile, owner role, and pending WhatsApp instance
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_org_id uuid;
    org_slug text;
BEGIN
    -- Generate unique slug from email
    org_slug := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9]', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 8);
    
    -- Create new organization
    INSERT INTO public.organizations (name, slug)
    VALUES (
        COALESCE(NEW.raw_user_meta_data->>'company_name', split_part(NEW.email, '@', 1) || '''s Organization'),
        org_slug
    )
    RETURNING id INTO new_org_id;
    
    -- Create user profile
    INSERT INTO public.profiles (user_id, organization_id, full_name)
    VALUES (
        NEW.id,
        new_org_id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
    
    -- Assign owner role
    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (NEW.id, new_org_id, 'owner');
    
    -- Create pending WhatsApp instance
    INSERT INTO public.whatsapp_instances (organization_id, status)
    VALUES (new_org_id, 'pending');
    
    RETURN NEW;
END;
$$;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add INSERT policy for organizations (needed for trigger)
DROP POLICY IF EXISTS "System can insert organizations" ON public.organizations;
CREATE POLICY "System can insert organizations" ON public.organizations
    FOR INSERT WITH CHECK (true);

-- Add INSERT policy for whatsapp_instances
DROP POLICY IF EXISTS "System can insert whatsapp instances" ON public.whatsapp_instances;
CREATE POLICY "System can insert whatsapp instances" ON public.whatsapp_instances
    FOR INSERT WITH CHECK (true);