-- 1. Add source_phone column to conversations
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS source_phone text;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_conversations_source_phone 
ON public.conversations(source_phone);

-- 3. Create function to get the active phone number
CREATE OR REPLACE FUNCTION public.get_active_phone_number(_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT phone_number FROM public.whatsapp_instances 
  WHERE organization_id = _org_id AND is_active = true 
  LIMIT 1;
$$;

-- 4. Backfill existing conversations with the current instance phone_number
UPDATE public.conversations c
SET source_phone = wi.phone_number
FROM public.whatsapp_instances wi
WHERE c.whatsapp_instance_id = wi.id
  AND c.source_phone IS NULL
  AND wi.phone_number IS NOT NULL;

-- 5. Drop old RLS policies
DROP POLICY IF EXISTS "Users can view conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can manage conversations in their organization" ON public.conversations;

-- 6. Create new RLS policies filtering by source_phone
CREATE POLICY "Users can view conversations in their organization" 
ON public.conversations 
FOR SELECT 
USING (
  organization_id = get_user_org_id(auth.uid()) 
  AND (
    source_phone IS NULL 
    OR source_phone = get_active_phone_number(organization_id)
  )
);

CREATE POLICY "Users can manage conversations in their organization" 
ON public.conversations 
FOR ALL 
USING (
  organization_id = get_user_org_id(auth.uid()) 
  AND (
    source_phone IS NULL 
    OR source_phone = get_active_phone_number(organization_id)
  )
);