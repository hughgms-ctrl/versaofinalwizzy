-- =============================================================================
-- WIZZY IA - FULL DATABASE EXPORT SCRIPT
-- Generated: 2026-02-18
-- Inclui: ENUMs, Functions, Tables, Foreign Keys, Indexes, RLS, Triggers, 
--         Realtime, Storage Buckets, Auth Trigger
-- =============================================================================

-- =============================================
-- 1. ENUMS
-- =============================================

CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'supervisor', 'agent');
CREATE TYPE public.conversation_status AS ENUM ('open', 'pending', 'resolved', 'archived');
CREATE TYPE public.message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE public.message_type AS ENUM ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location');
CREATE TYPE public.service_mode AS ENUM ('ia', 'ativo', 'pendente', 'arquivado');
CREATE TYPE public.whatsapp_instance_status AS ENUM ('pending', 'connecting', 'connected', 'disconnected');

-- =============================================
-- 2. FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT organization_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = _role
    )
$function$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = _user_id AND organization_id = _org_id
    )
$function$;

CREATE OR REPLACE FUNCTION public.get_active_instance_id(_org_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id FROM public.whatsapp_instances 
  WHERE organization_id = _org_id AND is_active = true 
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_phone_number(_org_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT phone_number FROM public.whatsapp_instances 
  WHERE organization_id = _org_id AND is_active = true 
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.deactivate_org_instances(_org_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.whatsapp_instances 
  SET is_active = false 
  WHERE organization_id = _org_id;
$function$;

CREATE OR REPLACE FUNCTION public.user_can_access_module(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT 
        CASE 
            WHEN has_role(_user_id, 'owner') OR has_role(_user_id, 'admin') THEN true
            WHEN _module = 'conversations' THEN COALESCE((SELECT can_access_conversations FROM user_permissions WHERE user_id = _user_id), false)
            WHEN _module = 'pipeline' THEN COALESCE((SELECT can_access_pipeline FROM user_permissions WHERE user_id = _user_id), false)
            WHEN _module = 'flows' THEN COALESCE((SELECT can_access_flows FROM user_permissions WHERE user_id = _user_id), false)
            WHEN _module = 'reports' THEN COALESCE((SELECT can_access_reports FROM user_permissions WHERE user_id = _user_id), false)
            WHEN _module = 'agents' THEN COALESCE((SELECT can_access_agents FROM user_permissions WHERE user_id = _user_id), false)
            WHEN _module = 'settings' THEN COALESCE((SELECT can_access_settings FROM user_permissions WHERE user_id = _user_id), false)
            WHEN _module = 'team' THEN COALESCE((SELECT can_access_team FROM user_permissions WHERE user_id = _user_id), false)
            WHEN _module = 'scheduled' THEN COALESCE((SELECT can_access_scheduled FROM user_permissions WHERE user_id = _user_id), false)
            ELSE false
        END
$function$;

CREATE OR REPLACE FUNCTION public.user_has_workspace_access(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    has_role(_user_id, 'owner') 
    OR has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE user_id = _user_id AND workspace_id = _workspace_id
    )
$function$;

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

-- =============================================
-- 3. TABLES (ordem de dependência)
-- =============================================

-- organizations (raiz)
CREATE TABLE public.organizations (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    logo_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- profiles
CREATE TABLE public.profiles (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    full_name text NOT NULL,
    phone text,
    avatar_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- user_roles
CREATE TABLE public.user_roles (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role app_role NOT NULL DEFAULT 'agent',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- user_permissions
CREATE TABLE public.user_permissions (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    can_access_conversations boolean NOT NULL DEFAULT false,
    can_access_pipeline boolean NOT NULL DEFAULT false,
    can_access_flows boolean NOT NULL DEFAULT false,
    can_access_reports boolean NOT NULL DEFAULT false,
    can_access_agents boolean NOT NULL DEFAULT false,
    can_access_settings boolean NOT NULL DEFAULT false,
    can_access_team boolean NOT NULL DEFAULT false,
    can_access_scheduled boolean NOT NULL DEFAULT false,
    conversations_filter_type text NOT NULL DEFAULT 'all',
    conversations_allowed_tags uuid[] DEFAULT '{}'::uuid[],
    pipeline_access_type text NOT NULL DEFAULT 'all',
    allowed_pipeline_ids uuid[] DEFAULT '{}'::uuid[],
    hide_unassigned_pipeline_ids uuid[] DEFAULT '{}'::uuid[],
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id)
);

-- tags
CREATE TABLE public.tags (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6366f1',
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- contacts
CREATE TABLE public.contacts (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text,
    phone text NOT NULL,
    email text,
    avatar_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, phone)
);

-- contact_tags
CREATE TABLE public.contact_tags (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    added_by uuid REFERENCES auth.users(id),
    added_by_type text NOT NULL DEFAULT 'manual' CHECK (added_by_type IN ('manual', 'flow', 'ai')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (contact_id, tag_id)
);

-- contact_notes
CREATE TABLE public.contact_notes (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- contact_folders
CREATE TABLE public.contact_folders (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- contact_presence
CREATE TABLE public.contact_presence (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE UNIQUE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    presence_type text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 seconds')
);

-- departments
CREATE TABLE public.departments (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6366f1',
    is_default boolean NOT NULL DEFAULT false,
    "order" integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- conversation_statuses
CREATE TABLE public.conversation_statuses (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6366f1',
    is_default boolean NOT NULL DEFAULT false,
    "order" integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- lead_sources
CREATE TABLE public.lead_sources (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6366f1',
    is_default boolean NOT NULL DEFAULT false,
    "order" integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- whatsapp_instances
CREATE TABLE public.whatsapp_instances (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    zapi_instance_id text,
    zapi_token text,
    phone_number text,
    status whatsapp_instance_status NOT NULL DEFAULT 'pending',
    connected_at timestamptz,
    disconnected_at timestamptz,
    is_active boolean NOT NULL DEFAULT false,
    default_status_id uuid,
    default_department_id uuid,
    default_assignee_id uuid,
    default_assignee_type text DEFAULT 'none',
    block_calls boolean NOT NULL DEFAULT false,
    block_calls_message text,
    label text DEFAULT 'Principal',
    webhook_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- whatsapp_connection_logs
CREATE TABLE public.whatsapp_connection_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
    event_type text NOT NULL,
    phone_number text,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- workspaces
CREATE TABLE public.workspaces (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    filter_tag_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
    color text NOT NULL DEFAULT '#6366f1',
    whatsapp_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- workspace_members
CREATE TABLE public.workspace_members (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, user_id)
);

-- workspace_agent_configs
CREATE TABLE public.workspace_agent_configs (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE UNIQUE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    master_prompt_id uuid,
    is_ai_enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- agent_folders
CREATE TABLE public.agent_folders (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ai_agents
CREATE TABLE public.ai_agents (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    avatar_url text,
    is_active boolean NOT NULL DEFAULT true,
    persona text,
    prompt_base text DEFAULT '',
    function_role text DEFAULT 'recepcao',
    knowledge_base jsonb DEFAULT '[]'::jsonb,
    tag_ids uuid[] DEFAULT '{}'::uuid[],
    pipeline_column_ids uuid[] DEFAULT '{}'::uuid[],
    flow_ids uuid[] DEFAULT '{}'::uuid[],
    folder_id uuid REFERENCES public.agent_folders(id) ON DELETE SET NULL,
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- master_prompts
CREATE TABLE public.master_prompts (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    content text NOT NULL DEFAULT '',
    niche text NOT NULL DEFAULT '',
    is_active boolean NOT NULL DEFAULT false,
    trigger_type text NOT NULL DEFAULT 'disabled',
    trigger_keywords jsonb DEFAULT '[]'::jsonb,
    trigger_tags uuid[] DEFAULT '{}'::uuid[],
    agent_sequence jsonb DEFAULT '[]'::jsonb,
    agent_rules jsonb DEFAULT '{}'::jsonb,
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- conversations
CREATE TABLE public.conversations (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    whatsapp_instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
    assigned_to uuid,
    ai_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
    status conversation_status NOT NULL DEFAULT 'open',
    service_mode service_mode NOT NULL DEFAULT 'pendente',
    conversation_status_id uuid REFERENCES public.conversation_statuses(id) ON DELETE SET NULL,
    department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
    lead_source_id uuid REFERENCES public.lead_sources(id) ON DELETE SET NULL,
    intervened_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    intervened_at timestamptz,
    unread_count integer NOT NULL DEFAULT 0,
    last_message_at timestamptz,
    last_synced_at timestamptz,
    oldest_synced_message_id text,
    source_phone text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- messages
CREATE TABLE public.messages (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    direction message_direction NOT NULL,
    type message_type NOT NULL DEFAULT 'text',
    content text,
    media_url text,
    sent_by uuid,
    is_from_bot boolean NOT NULL DEFAULT false,
    read_at timestamptz,
    delivered_at timestamptz,
    failed_at timestamptz,
    error_message text,
    zapi_message_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- media_transcriptions
CREATE TABLE public.media_transcriptions (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE UNIQUE,
    media_type text NOT NULL,
    media_url text NOT NULL,
    transcription text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- contact_files
CREATE TABLE public.contact_files (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
    folder_id uuid REFERENCES public.contact_folders(id) ON DELETE SET NULL,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    name text NOT NULL,
    file_type text NOT NULL,
    file_url text NOT NULL,
    file_size integer,
    storage_path text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- pipelines
CREATE TABLE public.pipelines (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    is_default boolean NOT NULL DEFAULT false,
    workspace_ids uuid[] DEFAULT '{}'::uuid[],
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- pipeline_columns
CREATE TABLE public.pipeline_columns (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6366f1',
    "order" integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- conversation_pipeline_positions
CREATE TABLE public.conversation_pipeline_positions (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
    column_id uuid NOT NULL REFERENCES public.pipeline_columns(id) ON DELETE CASCADE,
    "order" integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- flow_folders
CREATE TABLE public.flow_folders (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    parent_id uuid REFERENCES public.flow_folders(id) ON DELETE SET NULL,
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- flows
CREATE TABLE public.flows (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT false,
    trigger_type text NOT NULL DEFAULT 'manual',
    trigger_config jsonb DEFAULT '{}'::jsonb,
    nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
    edges jsonb NOT NULL DEFAULT '[]'::jsonb,
    variables jsonb DEFAULT '{}'::jsonb,
    triggers_count integer NOT NULL DEFAULT 0,
    folder_id uuid REFERENCES public.flow_folders(id) ON DELETE SET NULL,
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- flow_executions
CREATE TABLE public.flow_executions (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    flow_id uuid NOT NULL REFERENCES public.flows(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'running',
    current_node_id text,
    variables jsonb DEFAULT '{}'::jsonb,
    execution_log jsonb DEFAULT '[]'::jsonb,
    error_message text,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

-- agent_execution_logs
CREATE TABLE public.agent_execution_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    master_prompt_id uuid REFERENCES public.master_prompts(id) ON DELETE SET NULL,
    agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
    input_message text NOT NULL,
    ai_response text,
    tools_executed jsonb DEFAULT '[]'::jsonb,
    execution_time_ms integer,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- agent_function_roles
CREATE TABLE public.agent_function_roles (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    label text NOT NULL,
    value text NOT NULL,
    "order" integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- scheduled_messages
CREATE TABLE public.scheduled_messages (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text,
    target_type text NOT NULL,
    content_type text NOT NULL,
    message_content text,
    media_url text,
    media_type text,
    contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
    tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL,
    flow_id uuid REFERENCES public.flows(id) ON DELETE SET NULL,
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
    scheduled_at timestamptz NOT NULL,
    recurrence_type text DEFAULT 'once',
    recurrence_end_at timestamptz,
    next_execution_at timestamptz,
    last_executed_at timestamptz,
    execution_count integer DEFAULT 0,
    status text NOT NULL DEFAULT 'pending',
    error_message text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- scheduled_message_contacts
CREATE TABLE public.scheduled_message_contacts (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    scheduled_message_id uuid NOT NULL REFERENCES public.scheduled_messages(id) ON DELETE CASCADE,
    contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending',
    sent_at timestamptz,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- document_templates
CREATE TABLE public.document_templates (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    category text,
    content text NOT NULL DEFAULT '',
    fields jsonb NOT NULL DEFAULT '[]'::jsonb,
    original_file_url text,
    default_signing_method text DEFAULT 'manual',
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- document_packs
CREATE TABLE public.document_packs (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    template_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- generated_documents
CREATE TABLE public.generated_documents (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    template_id uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
    pack_id uuid REFERENCES public.document_packs(id) ON DELETE SET NULL,
    contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
    name text NOT NULL,
    filled_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    pdf_url text,
    status text NOT NULL DEFAULT 'draft',
    signing_method text,
    signing_status text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- document_signatures
CREATE TABLE public.document_signatures (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    generated_document_id uuid NOT NULL REFERENCES public.generated_documents(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
    signing_method text NOT NULL DEFAULT 'manual',
    status text NOT NULL DEFAULT 'pending',
    signer_name text,
    signer_email text,
    signer_phone text,
    signer_cpf text,
    signature_url text,
    signed_pdf_url text,
    external_id text,
    sent_at timestamptz,
    signed_at timestamptz,
    expires_at timestamptz,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- integration_configs
CREATE TABLE public.integration_configs (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
    ai_provider text NOT NULL DEFAULT 'lovable',
    default_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
    openai_api_key text,
    gemini_api_key text,
    agents_provider text,
    agents_model text,
    conversation_summary_provider text,
    conversation_summary_model text,
    prompt_generation_provider text,
    prompt_generation_model text,
    flow_generation_provider text,
    flow_generation_model text,
    transcription_provider text,
    transcription_model text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- widgets
CREATE TABLE public.widgets (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    folder_id uuid,
    workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT true,
    theme jsonb NOT NULL DEFAULT '{}'::jsonb,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    welcome_message text DEFAULT 'Olá! Preencha o formulário abaixo.',
    success_message text DEFAULT 'Obrigado! Em breve entraremos em contato.',
    target_status_id uuid,
    target_department_id uuid,
    target_assignee_id uuid,
    target_tag_ids uuid[] DEFAULT '{}'::uuid[],
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- widget_custom_fields
CREATE TABLE public.widget_custom_fields (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    widget_id uuid NOT NULL REFERENCES public.widgets(id) ON DELETE CASCADE,
    label text NOT NULL,
    field_type text NOT NULL DEFAULT 'text',
    placeholder text,
    is_required boolean NOT NULL DEFAULT false,
    options jsonb DEFAULT '[]'::jsonb,
    "order" integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- widget_folders
CREATE TABLE public.widget_folders (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- widget_submissions
CREATE TABLE public.widget_submissions (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    widget_id uuid NOT NULL REFERENCES public.widgets(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_url text,
    ip_address text,
    status text NOT NULL DEFAULT 'new',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================
-- 4. ENABLE ROW LEVEL SECURITY
-- =============================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connection_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_pipeline_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_function_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_message_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_submissions ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 5. RLS POLICIES
-- =============================================

-- organizations
CREATE POLICY "Users can view their organization" ON public.organizations FOR SELECT USING (user_belongs_to_org(auth.uid(), id));
CREATE POLICY "Owners and admins can update organization" ON public.organizations FOR UPDATE USING (user_belongs_to_org(auth.uid(), id) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));
CREATE POLICY "System can insert organizations" ON public.organizations FOR INSERT WITH CHECK (true);

-- profiles
CREATE POLICY "Users can view profiles in their organization" ON public.profiles FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (user_id = auth.uid());

-- user_roles
CREATE POLICY "Users can view roles in their organization" ON public.user_roles FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Owners can manage roles" ON public.user_roles FOR ALL USING (organization_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'owner'));

-- user_permissions
CREATE POLICY "Users can view org permissions" ON public.user_permissions FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can view their own permissions" ON public.user_permissions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Owners and admins can manage permissions" ON public.user_permissions FOR ALL USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- tags
CREATE POLICY "Users can view tags in their organization" ON public.tags FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage tags in their organization" ON public.tags FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- contacts
CREATE POLICY "Users can view contacts in their organization" ON public.contacts FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage contacts in their organization" ON public.contacts FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- contact_tags
CREATE POLICY "Users can view contact tags in their organization" ON public.contact_tags FOR SELECT USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND c.organization_id = get_user_org_id(auth.uid())));
CREATE POLICY "Users can manage contact tags in their organization" ON public.contact_tags FOR ALL USING (EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND c.organization_id = get_user_org_id(auth.uid())));

-- contact_notes
CREATE POLICY "Users can view notes in their organization" ON public.contact_notes FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage notes in their organization" ON public.contact_notes FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- contact_folders
CREATE POLICY "Users can view folders in their organization" ON public.contact_folders FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage folders in their organization" ON public.contact_folders FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- contact_presence
CREATE POLICY "Users can view presence in their organization" ON public.contact_presence FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));

-- contact_files
CREATE POLICY "Users can view files in their organization" ON public.contact_files FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage files in their organization" ON public.contact_files FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- departments
CREATE POLICY "Users can view departments in their org" ON public.departments FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Admins can manage departments in their org" ON public.departments FOR ALL USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- conversation_statuses
CREATE POLICY "Users can view statuses in their org" ON public.conversation_statuses FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Admins can manage statuses in their org" ON public.conversation_statuses FOR ALL USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- lead_sources
CREATE POLICY "Users can view lead sources in their org" ON public.lead_sources FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Admins can manage lead sources in their org" ON public.lead_sources FOR ALL USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- whatsapp_instances
CREATE POLICY "Users can view their org WhatsApp instance" ON public.whatsapp_instances FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Admins can manage WhatsApp instance" ON public.whatsapp_instances FOR ALL USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));
CREATE POLICY "System can insert whatsapp instances" ON public.whatsapp_instances FOR INSERT WITH CHECK (true);

-- whatsapp_connection_logs
CREATE POLICY "Users can view connection logs in their org" ON public.whatsapp_connection_logs FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Service role can manage connection logs" ON public.whatsapp_connection_logs FOR ALL USING (true) WITH CHECK (true);

-- workspaces
CREATE POLICY "Users can view workspaces in their org" ON public.workspaces FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Admins can manage workspaces in their org" ON public.workspaces FOR ALL USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- workspace_members
CREATE POLICY "Users can view workspace members in their org" ON public.workspace_members FOR SELECT USING (EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.organization_id = get_user_org_id(auth.uid())));
CREATE POLICY "Admins can manage workspace members" ON public.workspace_members FOR ALL USING (EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_members.workspace_id AND w.organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'))));

-- workspace_agent_configs
CREATE POLICY "Users can view workspace agent configs" ON public.workspace_agent_configs FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Admins can manage workspace agent configs" ON public.workspace_agent_configs FOR ALL USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- conversations
CREATE POLICY "Users can view conversations in their organization" ON public.conversations FOR SELECT USING (organization_id = get_user_org_id(auth.uid()) AND (source_phone IS NULL OR source_phone = get_active_phone_number(organization_id)));
CREATE POLICY "Users can manage conversations in their organization" ON public.conversations FOR ALL USING (organization_id = get_user_org_id(auth.uid()) AND (source_phone IS NULL OR source_phone = get_active_phone_number(organization_id)));
CREATE POLICY "Users can delete conversations in their organization" ON public.conversations FOR DELETE USING (organization_id = get_user_org_id(auth.uid()) AND (source_phone IS NULL OR source_phone = get_active_phone_number(organization_id)));

-- messages
CREATE POLICY "Users can view messages from their org conversations" ON public.messages FOR SELECT USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.organization_id = get_user_org_id(auth.uid())));
CREATE POLICY "Users can insert messages in their org conversations" ON public.messages FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.organization_id = get_user_org_id(auth.uid())));
CREATE POLICY "Users can delete messages from their org conversations" ON public.messages FOR DELETE USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.organization_id = get_user_org_id(auth.uid())));

-- media_transcriptions
CREATE POLICY "Users can view transcriptions for their org messages" ON public.media_transcriptions FOR SELECT USING (EXISTS (SELECT 1 FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = media_transcriptions.message_id AND c.organization_id = get_user_org_id(auth.uid())));
CREATE POLICY "Service role can manage transcriptions" ON public.media_transcriptions FOR ALL USING (true) WITH CHECK (true);

-- pipelines
CREATE POLICY "Users can view pipelines in their organization" ON public.pipelines FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage pipelines in their organization" ON public.pipelines FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- pipeline_columns
CREATE POLICY "Users can view columns in their org pipelines" ON public.pipeline_columns FOR SELECT USING (EXISTS (SELECT 1 FROM pipelines p WHERE p.id = pipeline_columns.pipeline_id AND p.organization_id = get_user_org_id(auth.uid())));
CREATE POLICY "Users can manage columns in their org pipelines" ON public.pipeline_columns FOR ALL USING (EXISTS (SELECT 1 FROM pipelines p WHERE p.id = pipeline_columns.pipeline_id AND p.organization_id = get_user_org_id(auth.uid())));

-- conversation_pipeline_positions
CREATE POLICY "Users can view positions in their org" ON public.conversation_pipeline_positions FOR SELECT USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_pipeline_positions.conversation_id AND c.organization_id = get_user_org_id(auth.uid())));
CREATE POLICY "Users can manage positions in their org" ON public.conversation_pipeline_positions FOR ALL USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_pipeline_positions.conversation_id AND c.organization_id = get_user_org_id(auth.uid())));

-- agent_folders
CREATE POLICY "Users can view agent folders in their org" ON public.agent_folders FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can create agent folders in their org" ON public.agent_folders FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can update agent folders in their org" ON public.agent_folders FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete agent folders in their org" ON public.agent_folders FOR DELETE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- ai_agents
CREATE POLICY "Users can view AI agents in their org" ON public.ai_agents FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Admins can manage AI agents in their org" ON public.ai_agents FOR ALL USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- master_prompts
CREATE POLICY "Users can view master prompts in their org" ON public.master_prompts FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Admins can manage master prompts in their org" ON public.master_prompts FOR ALL USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- agent_execution_logs
CREATE POLICY "Users can view execution logs in their org" ON public.agent_execution_logs FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Service role can manage execution logs" ON public.agent_execution_logs FOR ALL USING (true) WITH CHECK (true);

-- agent_function_roles
CREATE POLICY "Users can view their org roles" ON public.agent_function_roles FOR SELECT USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert roles" ON public.agent_function_roles FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can update roles" ON public.agent_function_roles FOR UPDATE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete roles" ON public.agent_function_roles FOR DELETE USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- flow_folders
CREATE POLICY "Users can view folders in their organization" ON public.flow_folders FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage folders in their organization" ON public.flow_folders FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- flows
CREATE POLICY "Users can view flows in their organization" ON public.flows FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage flows in their organization" ON public.flows FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- flow_executions
CREATE POLICY "Users can view executions in their organization" ON public.flow_executions FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage executions in their organization" ON public.flow_executions FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- scheduled_messages
CREATE POLICY "Users can view their org scheduled messages" ON public.scheduled_messages FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can create scheduled messages for their org" ON public.scheduled_messages FOR INSERT WITH CHECK (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can update their org scheduled messages" ON public.scheduled_messages FOR UPDATE USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can delete their org scheduled messages" ON public.scheduled_messages FOR DELETE USING (organization_id = get_user_org_id(auth.uid()));

-- scheduled_message_contacts
CREATE POLICY "Users can view scheduled message contacts via org" ON public.scheduled_message_contacts FOR SELECT USING (EXISTS (SELECT 1 FROM scheduled_messages sm WHERE sm.id = scheduled_message_contacts.scheduled_message_id AND sm.organization_id = get_user_org_id(auth.uid())));
CREATE POLICY "Users can create scheduled message contacts via org" ON public.scheduled_message_contacts FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM scheduled_messages sm WHERE sm.id = scheduled_message_contacts.scheduled_message_id AND sm.organization_id = get_user_org_id(auth.uid())));
CREATE POLICY "Users can update scheduled message contacts via org" ON public.scheduled_message_contacts FOR UPDATE USING (EXISTS (SELECT 1 FROM scheduled_messages sm WHERE sm.id = scheduled_message_contacts.scheduled_message_id AND sm.organization_id = get_user_org_id(auth.uid())));
CREATE POLICY "Users can delete scheduled message contacts via org" ON public.scheduled_message_contacts FOR DELETE USING (EXISTS (SELECT 1 FROM scheduled_messages sm WHERE sm.id = scheduled_message_contacts.scheduled_message_id AND sm.organization_id = get_user_org_id(auth.uid())));

-- document_templates
CREATE POLICY "Users can view document templates in their org" ON public.document_templates FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage document templates in their org" ON public.document_templates FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- document_packs
CREATE POLICY "Users can view document packs in their org" ON public.document_packs FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage document packs in their org" ON public.document_packs FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- generated_documents
CREATE POLICY "Users can view generated documents in their org" ON public.generated_documents FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage generated documents in their org" ON public.generated_documents FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- document_signatures
CREATE POLICY "Users can view signatures in their org" ON public.document_signatures FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage signatures in their org" ON public.document_signatures FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- integration_configs
CREATE POLICY "Users can view integration configs in their org" ON public.integration_configs FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Admins can manage integration configs" ON public.integration_configs FOR ALL USING (organization_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin')));

-- widgets
CREATE POLICY "Users can view widgets in their organization" ON public.widgets FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage widgets in their organization" ON public.widgets FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- widget_custom_fields
CREATE POLICY "Users can view custom fields via widget" ON public.widget_custom_fields FOR SELECT USING (EXISTS (SELECT 1 FROM widgets w WHERE w.id = widget_custom_fields.widget_id AND w.organization_id = get_user_org_id(auth.uid())));
CREATE POLICY "Users can manage custom fields via widget" ON public.widget_custom_fields FOR ALL USING (EXISTS (SELECT 1 FROM widgets w WHERE w.id = widget_custom_fields.widget_id AND w.organization_id = get_user_org_id(auth.uid())));

-- widget_folders
CREATE POLICY "Users can view folders in their organization" ON public.widget_folders FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Users can manage folders in their organization" ON public.widget_folders FOR ALL USING (organization_id = get_user_org_id(auth.uid()));

-- widget_submissions
CREATE POLICY "Users can view submissions in their organization" ON public.widget_submissions FOR SELECT USING (organization_id = get_user_org_id(auth.uid()));
CREATE POLICY "Service role can manage submissions" ON public.widget_submissions FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 6. INDEXES
-- =============================================

CREATE INDEX idx_agent_execution_logs_conversation ON public.agent_execution_logs USING btree (conversation_id);
CREATE INDEX idx_agent_execution_logs_created ON public.agent_execution_logs USING btree (created_at DESC);
CREATE INDEX idx_contact_files_contact_id ON public.contact_files USING btree (contact_id);
CREATE INDEX idx_contact_files_folder_id ON public.contact_files USING btree (folder_id);
CREATE INDEX idx_contact_folders_contact_id ON public.contact_folders USING btree (contact_id);
CREATE INDEX idx_contact_notes_contact_id ON public.contact_notes USING btree (contact_id);
CREATE INDEX idx_contact_presence_contact ON public.contact_presence USING btree (contact_id);
CREATE INDEX idx_contact_presence_expires ON public.contact_presence USING btree (expires_at);
CREATE INDEX idx_conv_positions_conv ON public.conversation_pipeline_positions USING btree (conversation_id);
CREATE INDEX idx_conv_positions_pipeline ON public.conversation_pipeline_positions USING btree (pipeline_id);
CREATE INDEX idx_conversations_conversation_status_id ON public.conversations USING btree (conversation_status_id);
CREATE INDEX idx_conversations_department_id ON public.conversations USING btree (department_id);
CREATE INDEX idx_conversations_lead_source_id ON public.conversations USING btree (lead_source_id);
CREATE INDEX idx_conversations_service_mode ON public.conversations USING btree (service_mode);
CREATE INDEX idx_conversations_source_phone ON public.conversations USING btree (source_phone);
CREATE INDEX idx_flow_folders_organization_id ON public.flow_folders USING btree (organization_id);
CREATE INDEX idx_flow_folders_parent_id ON public.flow_folders USING btree (parent_id);
CREATE INDEX idx_flows_folder_id ON public.flows USING btree (folder_id);
CREATE INDEX idx_media_transcriptions_media_url ON public.media_transcriptions USING btree (media_url);
CREATE INDEX idx_media_transcriptions_message_id ON public.media_transcriptions USING btree (message_id);
CREATE INDEX idx_pipeline_columns_order ON public.pipeline_columns USING btree (pipeline_id, "order");
CREATE INDEX idx_pipeline_columns_pipeline ON public.pipeline_columns USING btree (pipeline_id);
CREATE INDEX idx_scheduled_message_contacts_msg ON public.scheduled_message_contacts USING btree (scheduled_message_id);
CREATE INDEX idx_scheduled_messages_next_exec ON public.scheduled_messages USING btree (next_execution_at) WHERE (status = 'pending');
CREATE INDEX idx_scheduled_messages_org ON public.scheduled_messages USING btree (organization_id);
CREATE INDEX idx_scheduled_messages_status ON public.scheduled_messages USING btree (status);
CREATE INDEX idx_whatsapp_connection_logs_org ON public.whatsapp_connection_logs USING btree (organization_id);
CREATE INDEX idx_whatsapp_connection_logs_instance ON public.whatsapp_connection_logs USING btree (instance_id);

-- =============================================
-- 7. TRIGGERS (updated_at)
-- =============================================

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_agents_updated_at BEFORE UPDATE ON public.ai_agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contact_notes_updated_at BEFORE UPDATE ON public.contact_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversation_statuses_updated_at BEFORE UPDATE ON public.conversation_statuses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversation_pipeline_positions_updated_at BEFORE UPDATE ON public.conversation_pipeline_positions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lead_sources_updated_at BEFORE UPDATE ON public.lead_sources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pipelines_updated_at BEFORE UPDATE ON public.pipelines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pipeline_columns_updated_at BEFORE UPDATE ON public.pipeline_columns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_whatsapp_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workspace_agent_configs_updated_at BEFORE UPDATE ON public.workspace_agent_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_master_prompts_updated_at BEFORE UPDATE ON public.master_prompts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_flows_updated_at BEFORE UPDATE ON public.flows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_flow_folders_updated_at BEFORE UPDATE ON public.flow_folders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_scheduled_messages_updated_at BEFORE UPDATE ON public.scheduled_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_document_templates_updated_at BEFORE UPDATE ON public.document_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_document_packs_updated_at BEFORE UPDATE ON public.document_packs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_generated_documents_updated_at BEFORE UPDATE ON public.generated_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_document_signatures_updated_at BEFORE UPDATE ON public.document_signatures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_integration_configs_updated_at BEFORE UPDATE ON public.integration_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_widgets_updated_at BEFORE UPDATE ON public.widgets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_widget_folders_updated_at BEFORE UPDATE ON public.widget_folders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_permissions_updated_at BEFORE UPDATE ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_folders_updated_at BEFORE UPDATE ON public.agent_folders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 8. REALTIME
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.flow_executions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspaces;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_members;

-- =============================================
-- 9. STORAGE BUCKETS
-- =============================================

INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('flow-media', 'flow-media', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('contact-files', 'contact-files', true) ON CONFLICT DO NOTHING;

-- =============================================
-- 10. AUTH TRIGGER (handle_new_user)
-- =============================================

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
