-- Create widget_folders table
CREATE TABLE public.widget_folders (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.widget_folders(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create widgets table
CREATE TABLE public.widgets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES public.widget_folders(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Button configuration
    button_text TEXT NOT NULL DEFAULT 'Fale Conosco',
    button_color TEXT NOT NULL DEFAULT '#6366f1',
    button_text_color TEXT NOT NULL DEFAULT '#ffffff',
    button_size TEXT NOT NULL DEFAULT 'medium', -- small, medium, large
    button_position TEXT NOT NULL DEFAULT 'bottom-right', -- bottom-right, bottom-left, etc.
    button_border_radius INTEGER NOT NULL DEFAULT 8,
    button_icon TEXT DEFAULT 'message-circle', -- lucide icon name
    
    -- Form configuration
    form_title TEXT NOT NULL DEFAULT 'Entre em contato',
    form_subtitle TEXT,
    form_background_color TEXT NOT NULL DEFAULT '#ffffff',
    form_text_color TEXT NOT NULL DEFAULT '#1f2937',
    form_accent_color TEXT NOT NULL DEFAULT '#6366f1',
    form_background_image TEXT,
    form_logo_url TEXT,
    
    -- Required fields configuration (which standard fields to show/require)
    field_name_enabled BOOLEAN NOT NULL DEFAULT true,
    field_name_required BOOLEAN NOT NULL DEFAULT false,
    field_email_enabled BOOLEAN NOT NULL DEFAULT true,
    field_email_required BOOLEAN NOT NULL DEFAULT false,
    field_cpf_enabled BOOLEAN NOT NULL DEFAULT false,
    field_cpf_required BOOLEAN NOT NULL DEFAULT false,
    field_whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
    field_whatsapp_required BOOLEAN NOT NULL DEFAULT true,
    
    -- Integration configuration
    integration_type TEXT NOT NULL DEFAULT 'register_only', -- register_only, send_message, trigger_flow
    message_template TEXT,
    flow_id UUID REFERENCES public.flows(id) ON DELETE SET NULL,
    auto_create_conversation BOOLEAN NOT NULL DEFAULT true,
    
    -- Pixel/tracking configuration
    pixel_enabled BOOLEAN NOT NULL DEFAULT false,
    pixel_code TEXT,
    pixel_event_name TEXT DEFAULT 'FormSubmit',
    
    -- Success configuration
    success_message TEXT NOT NULL DEFAULT 'Obrigado! Entraremos em contato em breve.',
    success_redirect_url TEXT,
    
    -- Metadata
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Custom fields for qualification questions
CREATE TABLE public.widget_custom_fields (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    widget_id UUID NOT NULL REFERENCES public.widgets(id) ON DELETE CASCADE,
    field_label TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'text', -- text, select, checkbox, textarea
    field_options JSONB, -- for select type: ["Option 1", "Option 2"]
    field_placeholder TEXT,
    is_required BOOLEAN NOT NULL DEFAULT false,
    field_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Widget submissions log
CREATE TABLE public.widget_submissions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    widget_id UUID NOT NULL REFERENCES public.widgets(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    
    -- Submitted data
    submitted_name TEXT,
    submitted_email TEXT,
    submitted_cpf TEXT,
    submitted_whatsapp TEXT NOT NULL,
    custom_fields_data JSONB,
    
    -- Tracking
    ip_address TEXT,
    user_agent TEXT,
    referrer_url TEXT,
    page_url TEXT,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processed, failed
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.widget_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for widget_folders
CREATE POLICY "Users can view folders in their organization"
ON public.widget_folders FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage folders in their organization"
ON public.widget_folders FOR ALL
USING (organization_id = get_user_org_id(auth.uid()));

-- RLS Policies for widgets
CREATE POLICY "Users can view widgets in their organization"
ON public.widgets FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage widgets in their organization"
ON public.widgets FOR ALL
USING (organization_id = get_user_org_id(auth.uid()));

-- RLS Policies for widget_custom_fields
CREATE POLICY "Users can view custom fields via widget"
ON public.widget_custom_fields FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.widgets w
    WHERE w.id = widget_custom_fields.widget_id
    AND w.organization_id = get_user_org_id(auth.uid())
));

CREATE POLICY "Users can manage custom fields via widget"
ON public.widget_custom_fields FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.widgets w
    WHERE w.id = widget_custom_fields.widget_id
    AND w.organization_id = get_user_org_id(auth.uid())
));

-- RLS Policies for widget_submissions (also allow service role for edge functions)
CREATE POLICY "Users can view submissions in their organization"
ON public.widget_submissions FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage submissions"
ON public.widget_submissions FOR ALL
USING (true)
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_widgets_organization ON public.widgets(organization_id);
CREATE INDEX idx_widgets_folder ON public.widgets(folder_id);
CREATE INDEX idx_widget_custom_fields_widget ON public.widget_custom_fields(widget_id);
CREATE INDEX idx_widget_submissions_widget ON public.widget_submissions(widget_id);
CREATE INDEX idx_widget_submissions_organization ON public.widget_submissions(organization_id);
CREATE INDEX idx_widget_submissions_contact ON public.widget_submissions(contact_id);

-- Update timestamp triggers
CREATE TRIGGER update_widget_folders_updated_at
BEFORE UPDATE ON public.widget_folders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_widgets_updated_at
BEFORE UPDATE ON public.widgets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();