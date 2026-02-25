-- =====================================================
-- GRUPO 1: INFRAESTRUTURA BASE E CRM ESSENCIAL
-- =====================================================

-- 1. ENTIDADE STATUS (configurável pelo admin)
CREATE TABLE public.conversation_statuses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6366f1',
    "order" integer NOT NULL DEFAULT 0,
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(organization_id, name)
);

ALTER TABLE public.conversation_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view statuses in their org"
ON public.conversation_statuses FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage statuses in their org"
ON public.conversation_statuses FOR ALL
USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- 2. ENTIDADE DEPARTAMENTO
CREATE TABLE public.departments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6366f1',
    "order" integer NOT NULL DEFAULT 0,
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(organization_id, name)
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view departments in their org"
ON public.departments FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage departments in their org"
ON public.departments FOR ALL
USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- 3. ENTIDADE ORIGEM
CREATE TABLE public.lead_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6366f1',
    "order" integer NOT NULL DEFAULT 0,
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(organization_id, name)
);

ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead sources in their org"
ON public.lead_sources FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage lead sources in their org"
ON public.lead_sources FOR ALL
USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- 4. ENTIDADE AGENTE_IA (placeholder para Grupo 2)
CREATE TABLE public.ai_agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    avatar_url text,
    is_active boolean NOT NULL DEFAULT true,
    persona text,
    knowledge_base jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view AI agents in their org"
ON public.ai_agents FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage AI agents in their org"
ON public.ai_agents FOR ALL
USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- 5. LOGS DE CONEXÃO WHATSAPP
CREATE TABLE public.whatsapp_connection_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
    event_type text NOT NULL, -- 'connected', 'disconnected', 'qr_scanned', 'error'
    phone_number text,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_connection_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view connection logs in their org"
ON public.whatsapp_connection_logs FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage connection logs"
ON public.whatsapp_connection_logs FOR ALL
USING (true)
WITH CHECK (true);

-- 6. ADICIONAR NOVOS CAMPOS À TABELA CONVERSATIONS
-- Criar enum para modo_atendimento
CREATE TYPE public.service_mode AS ENUM ('ia', 'ativo', 'pendente', 'arquivado');

-- Adicionar novos campos à conversations
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS service_mode public.service_mode NOT NULL DEFAULT 'pendente',
ADD COLUMN IF NOT EXISTS conversation_status_id uuid REFERENCES public.conversation_statuses(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS lead_source_id uuid REFERENCES public.lead_sources(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS ai_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS intervened_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS intervened_at timestamptz;

-- 7. ADICIONAR CONFIGURAÇÕES PADRÃO À WHATSAPP_INSTANCES
ALTER TABLE public.whatsapp_instances
ADD COLUMN IF NOT EXISTS default_status_id uuid REFERENCES public.conversation_statuses(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS default_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS default_assignee_id uuid, -- Can reference profile or ai_agent
ADD COLUMN IF NOT EXISTS default_assignee_type text DEFAULT 'none', -- 'member', 'ai_agent', 'none'
ADD COLUMN IF NOT EXISTS block_calls boolean NOT NULL DEFAULT false;

-- 8. CRIAR ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_conversations_service_mode ON public.conversations(service_mode);
CREATE INDEX IF NOT EXISTS idx_conversations_department_id ON public.conversations(department_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_source_id ON public.conversations(lead_source_id);
CREATE INDEX IF NOT EXISTS idx_conversations_conversation_status_id ON public.conversations(conversation_status_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connection_logs_org ON public.whatsapp_connection_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connection_logs_instance ON public.whatsapp_connection_logs(instance_id);

-- 9. TRIGGER PARA UPDATED_AT
CREATE TRIGGER update_conversation_statuses_updated_at
BEFORE UPDATE ON public.conversation_statuses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_departments_updated_at
BEFORE UPDATE ON public.departments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lead_sources_updated_at
BEFORE UPDATE ON public.lead_sources
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_agents_updated_at
BEFORE UPDATE ON public.ai_agents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();