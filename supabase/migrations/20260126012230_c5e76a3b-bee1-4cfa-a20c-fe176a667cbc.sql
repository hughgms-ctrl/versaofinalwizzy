-- Remove unique constraint on organization_id to allow multiple instances per org
ALTER TABLE public.whatsapp_instances DROP CONSTRAINT IF EXISTS whatsapp_instances_organization_id_fkey;

-- Re-add as non-unique foreign key
ALTER TABLE public.whatsapp_instances 
ADD CONSTRAINT whatsapp_instances_organization_id_fkey 
FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add is_active flag to track which instance is currently being used
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

-- Create function to deactivate all instances for an org (to ensure only one is active)
CREATE OR REPLACE FUNCTION public.deactivate_org_instances(_org_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.whatsapp_instances 
  SET is_active = false 
  WHERE organization_id = _org_id;
$$;

-- Create function to get active instance id for an org
CREATE OR REPLACE FUNCTION public.get_active_instance_id(_org_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.whatsapp_instances 
  WHERE organization_id = _org_id AND is_active = true 
  LIMIT 1;
$$;

-- Update RLS policy for conversations to filter by active instance
DROP POLICY IF EXISTS "Users can view conversations in their organization" ON public.conversations;
CREATE POLICY "Users can view conversations in their organization" 
ON public.conversations 
FOR SELECT
USING (
  organization_id = get_user_org_id(auth.uid()) 
  AND (
    whatsapp_instance_id IS NULL 
    OR whatsapp_instance_id = get_active_instance_id(organization_id)
  )
);

-- Update the ALL policy similarly
DROP POLICY IF EXISTS "Users can manage conversations in their organization" ON public.conversations;
CREATE POLICY "Users can manage conversations in their organization" 
ON public.conversations 
FOR ALL
USING (
  organization_id = get_user_org_id(auth.uid()) 
  AND (
    whatsapp_instance_id IS NULL 
    OR whatsapp_instance_id = get_active_instance_id(organization_id)
  )
);

-- Set existing instances as active (migration)
UPDATE public.whatsapp_instances SET is_active = true WHERE status = 'connected';