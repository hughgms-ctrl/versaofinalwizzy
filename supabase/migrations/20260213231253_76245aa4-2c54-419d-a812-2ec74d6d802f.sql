
-- 1. Add label column to whatsapp_instances
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS label text;

-- 2. Remove the one-to-one constraint on organization_id (allow multiple instances per org)
-- First check if the unique constraint exists and drop it
DO $$ 
BEGIN
  -- Drop unique constraint if exists (the foreign key has isOneToOne: true)
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'whatsapp_instances_organization_id_fkey' 
    AND contype = 'f'
  ) THEN
    ALTER TABLE public.whatsapp_instances DROP CONSTRAINT whatsapp_instances_organization_id_fkey;
    -- Re-add as regular foreign key (not unique)
    ALTER TABLE public.whatsapp_instances 
      ADD CONSTRAINT whatsapp_instances_organization_id_fkey 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id);
  END IF;
  
  -- Drop unique index on organization_id if exists
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'whatsapp_instances' 
    AND indexdef LIKE '%UNIQUE%' 
    AND indexdef LIKE '%organization_id%'
  ) THEN
    -- Find and drop the unique constraint/index
    PERFORM 1; -- handled below
  END IF;
END $$;

-- Drop any unique constraint on organization_id
DO $$
DECLARE
  _constraint_name text;
BEGIN
  FOR _constraint_name IN 
    SELECT c.conname 
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'whatsapp_instances' 
    AND c.contype = 'u'
    AND EXISTS (
      SELECT 1 FROM pg_attribute a 
      WHERE a.attrelid = t.oid 
      AND a.attnum = ANY(c.conkey) 
      AND a.attname = 'organization_id'
    )
  LOOP
    EXECUTE format('ALTER TABLE public.whatsapp_instances DROP CONSTRAINT %I', _constraint_name);
  END LOOP;
END $$;

-- 3. Update get_active_instance_id to support multi-instance (no change needed, it already uses LIMIT 1)
-- 4. Update get_active_phone_number similarly (already uses LIMIT 1)

-- 5. Update handle_new_user to set a label on the default instance
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
    
    INSERT INTO public.organizations (name, slug)
    VALUES (
        COALESCE(NEW.raw_user_meta_data->>'company_name', split_part(NEW.email, '@', 1) || '''s Organization'),
        org_slug
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
$function$;
