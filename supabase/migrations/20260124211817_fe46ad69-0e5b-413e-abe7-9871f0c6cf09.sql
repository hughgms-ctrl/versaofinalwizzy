-- Create scheduled messages table
CREATE TABLE public.scheduled_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Scheduling config
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  
  -- Recurrence config
  recurrence_type TEXT DEFAULT 'once' CHECK (recurrence_type IN ('once', 'daily', 'weekly', 'monthly')),
  recurrence_end_at TIMESTAMPTZ,
  next_execution_at TIMESTAMPTZ,
  last_executed_at TIMESTAMPTZ,
  execution_count INT DEFAULT 0,
  
  -- Content type
  content_type TEXT NOT NULL CHECK (content_type IN ('message', 'flow')),
  
  -- For message type
  message_content TEXT,
  media_url TEXT,
  media_type TEXT,
  
  -- For flow type
  flow_id UUID REFERENCES public.flows(id) ON DELETE SET NULL,
  
  -- Target contacts
  target_type TEXT NOT NULL CHECK (target_type IN ('single', 'tag', 'manual')),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
  
  -- Metadata
  name TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table for manually selected contacts in bulk scheduling
CREATE TABLE public.scheduled_message_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scheduled_message_id UUID NOT NULL REFERENCES public.scheduled_messages(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(scheduled_message_id, contact_id)
);

-- Enable RLS
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_message_contacts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scheduled_messages
CREATE POLICY "Users can view their org scheduled messages" 
ON public.scheduled_messages FOR SELECT 
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can create scheduled messages for their org" 
ON public.scheduled_messages FOR INSERT 
WITH CHECK (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can update their org scheduled messages" 
ON public.scheduled_messages FOR UPDATE 
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can delete their org scheduled messages" 
ON public.scheduled_messages FOR DELETE 
USING (organization_id = get_user_org_id(auth.uid()));

-- RLS Policies for scheduled_message_contacts
CREATE POLICY "Users can view scheduled message contacts via org" 
ON public.scheduled_message_contacts FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.scheduled_messages sm 
  WHERE sm.id = scheduled_message_id 
  AND sm.organization_id = get_user_org_id(auth.uid())
));

CREATE POLICY "Users can create scheduled message contacts via org" 
ON public.scheduled_message_contacts FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.scheduled_messages sm 
  WHERE sm.id = scheduled_message_id 
  AND sm.organization_id = get_user_org_id(auth.uid())
));

CREATE POLICY "Users can update scheduled message contacts via org" 
ON public.scheduled_message_contacts FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.scheduled_messages sm 
  WHERE sm.id = scheduled_message_id 
  AND sm.organization_id = get_user_org_id(auth.uid())
));

CREATE POLICY "Users can delete scheduled message contacts via org" 
ON public.scheduled_message_contacts FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.scheduled_messages sm 
  WHERE sm.id = scheduled_message_id 
  AND sm.organization_id = get_user_org_id(auth.uid())
));

-- Indexes for performance
CREATE INDEX idx_scheduled_messages_org ON public.scheduled_messages(organization_id);
CREATE INDEX idx_scheduled_messages_status ON public.scheduled_messages(status);
CREATE INDEX idx_scheduled_messages_next_exec ON public.scheduled_messages(next_execution_at) WHERE status = 'pending';
CREATE INDEX idx_scheduled_message_contacts_msg ON public.scheduled_message_contacts(scheduled_message_id);

-- Trigger for updated_at
CREATE TRIGGER update_scheduled_messages_updated_at
BEFORE UPDATE ON public.scheduled_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();