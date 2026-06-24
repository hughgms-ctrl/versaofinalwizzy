-- Platform-level settings table
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT 'true'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage settings"
  ON public.platform_settings FOR ALL
  USING (is_platform_admin(auth.uid()));

CREATE POLICY "Anyone can read settings"
  ON public.platform_settings FOR SELECT
  USING (true);

-- Insert default: signups allowed
INSERT INTO public.platform_settings (key, value) VALUES ('allow_signups', 'true'::jsonb);

-- Modify handle_new_user to check allow_signups and ban if disabled
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

    -- If signups are not allowed, mark user metadata for pending approval
    IF NOT COALESCE(_allow_signups, true) THEN
        NEW.raw_user_meta_data := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb) || '{"pending_approval": true}'::jsonb;
    END IF;
    
    RETURN NEW;
END;
$function$;;
