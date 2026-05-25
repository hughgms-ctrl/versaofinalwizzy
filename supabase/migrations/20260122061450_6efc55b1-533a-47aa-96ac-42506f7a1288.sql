-- Create table for storing contact presence (typing, recording, etc.)
CREATE TABLE public.contact_presence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  presence_type TEXT NOT NULL, -- 'typing', 'recording', 'online', 'offline'
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 seconds'),
  UNIQUE(contact_id)
);

-- Enable RLS
ALTER TABLE public.contact_presence ENABLE ROW LEVEL SECURITY;

-- Users can view presence in their organization
CREATE POLICY "Users can view presence in their organization"
ON public.contact_presence FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

-- System can manage presence (service role)
CREATE POLICY "System can manage presence"
ON public.contact_presence FOR ALL
USING (true)
WITH CHECK (true);

-- Enable realtime for presence updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_presence;

-- Create index for fast lookups
CREATE INDEX idx_contact_presence_contact ON public.contact_presence(contact_id);
CREATE INDEX idx_contact_presence_expires ON public.contact_presence(expires_at);