-- Enum para status da instância WhatsApp
CREATE TYPE public.whatsapp_instance_status AS ENUM ('pending', 'connecting', 'connected', 'disconnected');

-- Enum para roles de usuário
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'supervisor', 'agent');

-- Enum para status de conversa
CREATE TYPE public.conversation_status AS ENUM ('open', 'pending', 'resolved', 'archived');

-- Enum para tipo de mensagem
CREATE TYPE public.message_type AS ENUM ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location');

-- Enum para direção da mensagem
CREATE TYPE public.message_direction AS ENUM ('inbound', 'outbound');

-- Tabela de organizações (multi-tenant)
CREATE TABLE public.organizations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de perfis de usuários
CREATE TABLE public.profiles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de roles (separada para segurança)
CREATE TABLE public.user_roles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL DEFAULT 'agent',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, organization_id)
);

-- Tabela de instâncias WhatsApp
-- zapi_instance_id é NULL até o primeiro QR code ser gerado
CREATE TABLE public.whatsapp_instances (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL UNIQUE,
    zapi_instance_id TEXT, -- NULL até primeiro QR code
    zapi_token TEXT, -- Token da instância Z-API
    phone_number TEXT, -- Número conectado
    status public.whatsapp_instance_status NOT NULL DEFAULT 'pending',
    connected_at TIMESTAMP WITH TIME ZONE,
    disconnected_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de contatos
CREATE TABLE public.contacts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    phone TEXT NOT NULL,
    name TEXT,
    email TEXT,
    avatar_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (organization_id, phone)
);

-- Tabela de conversas
CREATE TABLE public.conversations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE NOT NULL,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status public.conversation_status NOT NULL DEFAULT 'open',
    last_message_at TIMESTAMP WITH TIME ZONE,
    unread_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de mensagens
CREATE TABLE public.messages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
    direction public.message_direction NOT NULL,
    type public.message_type NOT NULL DEFAULT 'text',
    content TEXT,
    media_url TEXT,
    zapi_message_id TEXT, -- ID da mensagem no Z-API
    sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL se inbound ou bot
    is_from_bot BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Function to check organization membership
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = _user_id AND organization_id = _org_id
    )
$$;

-- Function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = _role
    )
$$;

-- Function to get user's organization
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- RLS Policies for organizations
CREATE POLICY "Users can view their organization"
ON public.organizations FOR SELECT
USING (public.user_belongs_to_org(auth.uid(), id));

CREATE POLICY "Owners and admins can update organization"
ON public.organizations FOR UPDATE
USING (
    public.user_belongs_to_org(auth.uid(), id) AND
    (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
);

-- RLS Policies for profiles
CREATE POLICY "Users can view profiles in their organization"
ON public.profiles FOR SELECT
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (user_id = auth.uid());

-- RLS Policies for user_roles
CREATE POLICY "Users can view roles in their organization"
ON public.user_roles FOR SELECT
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Owners can manage roles"
ON public.user_roles FOR ALL
USING (
    organization_id = public.get_user_org_id(auth.uid()) AND
    public.has_role(auth.uid(), 'owner')
);

-- RLS Policies for whatsapp_instances
CREATE POLICY "Users can view their org WhatsApp instance"
ON public.whatsapp_instances FOR SELECT
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage WhatsApp instance"
ON public.whatsapp_instances FOR ALL
USING (
    organization_id = public.get_user_org_id(auth.uid()) AND
    (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
);

-- RLS Policies for contacts
CREATE POLICY "Users can view contacts in their organization"
ON public.contacts FOR SELECT
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage contacts in their organization"
ON public.contacts FOR ALL
USING (organization_id = public.get_user_org_id(auth.uid()));

-- RLS Policies for conversations
CREATE POLICY "Users can view conversations in their organization"
ON public.conversations FOR SELECT
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage conversations in their organization"
ON public.conversations FOR ALL
USING (organization_id = public.get_user_org_id(auth.uid()));

-- RLS Policies for messages
CREATE POLICY "Users can view messages from their org conversations"
ON public.messages FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_id
        AND c.organization_id = public.get_user_org_id(auth.uid())
    )
);

CREATE POLICY "Users can insert messages in their org conversations"
ON public.messages FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_id
        AND c.organization_id = public.get_user_org_id(auth.uid())
    )
);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_whatsapp_instances_updated_at
BEFORE UPDATE ON public.whatsapp_instances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;