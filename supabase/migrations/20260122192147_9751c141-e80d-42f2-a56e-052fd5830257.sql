-- Create tags table
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, name)
);

-- Create contact_tags junction table
CREATE TABLE public.contact_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  added_by UUID REFERENCES auth.users(id),
  added_by_type TEXT NOT NULL DEFAULT 'manual' CHECK (added_by_type IN ('manual', 'flow', 'ai')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contact_id, tag_id)
);

-- Enable RLS
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

-- RLS policies for tags
CREATE POLICY "Users can view tags in their organization" 
ON public.tags 
FOR SELECT 
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage tags in their organization" 
ON public.tags 
FOR ALL 
USING (organization_id = get_user_org_id(auth.uid()));

-- RLS policies for contact_tags
CREATE POLICY "Users can view contact tags in their organization" 
ON public.contact_tags 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM contacts c 
  WHERE c.id = contact_tags.contact_id 
  AND c.organization_id = get_user_org_id(auth.uid())
));

CREATE POLICY "Users can manage contact tags in their organization" 
ON public.contact_tags 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM contacts c 
  WHERE c.id = contact_tags.contact_id 
  AND c.organization_id = get_user_org_id(auth.uid())
));

-- Add updated_at trigger for tags
CREATE TRIGGER update_tags_updated_at
BEFORE UPDATE ON public.tags
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();