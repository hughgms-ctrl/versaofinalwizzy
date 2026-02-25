-- Create contact_notes table for detailed notes
CREATE TABLE public.contact_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create contact_folders table for custom folders
CREATE TABLE public.contact_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create contact_files table for archived files
CREATE TABLE public.contact_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.contact_folders(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'image', 'video', 'audio', 'document'
  file_size INTEGER,
  storage_path TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_files ENABLE ROW LEVEL SECURITY;

-- RLS policies for contact_notes
CREATE POLICY "Users can view notes in their organization" 
ON public.contact_notes 
FOR SELECT 
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage notes in their organization" 
ON public.contact_notes 
FOR ALL 
USING (organization_id = get_user_org_id(auth.uid()));

-- RLS policies for contact_folders
CREATE POLICY "Users can view folders in their organization" 
ON public.contact_folders 
FOR SELECT 
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage folders in their organization" 
ON public.contact_folders 
FOR ALL 
USING (organization_id = get_user_org_id(auth.uid()));

-- RLS policies for contact_files
CREATE POLICY "Users can view files in their organization" 
ON public.contact_files 
FOR SELECT 
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage files in their organization" 
ON public.contact_files 
FOR ALL 
USING (organization_id = get_user_org_id(auth.uid()));

-- Create storage bucket for contact files
INSERT INTO storage.buckets (id, name, public)
VALUES ('contact-files', 'contact-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can view contact files"
ON storage.objects FOR SELECT
USING (bucket_id = 'contact-files');

CREATE POLICY "Authenticated users can upload contact files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'contact-files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update contact files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'contact-files' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete contact files"
ON storage.objects FOR DELETE
USING (bucket_id = 'contact-files' AND auth.role() = 'authenticated');

-- Create indexes for performance
CREATE INDEX idx_contact_notes_contact_id ON public.contact_notes(contact_id);
CREATE INDEX idx_contact_folders_contact_id ON public.contact_folders(contact_id);
CREATE INDEX idx_contact_files_contact_id ON public.contact_files(contact_id);
CREATE INDEX idx_contact_files_folder_id ON public.contact_files(folder_id);

-- Create trigger for updated_at on contact_notes
CREATE TRIGGER update_contact_notes_updated_at
BEFORE UPDATE ON public.contact_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();