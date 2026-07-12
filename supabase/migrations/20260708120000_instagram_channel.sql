-- Instagram channel (Meta Graph API) — Phase 1
-- New tables only. No changes to existing WhatsApp-shaped tables (contacts/conversations/messages).
-- Mirrors the whatsapp_instances / conversations / messages shape so the inbox UI can reuse
-- existing list/detail components with minimal branching, while keeping Instagram contacts
-- fully separate from WhatsApp contacts (no auto-merge across channels).

-- ============================================================================
-- Enums
-- ============================================================================

CREATE TYPE public.instagram_account_status AS ENUM ('pending', 'connected', 'disconnected', 'error');

CREATE TYPE public.instagram_message_type AS ENUM (
  'text', 'image', 'video', 'audio', 'comment_reply', 'story_reply', 'story_mention'
);

CREATE TYPE public.instagram_execution_status AS ENUM ('success', 'error', 'skipped');

-- Reused as-is (already generic enough): public.message_direction ('inbound'/'outbound'),
-- public.conversation_status ('open'/'pending'/'resolved'/'archived').

-- ============================================================================
-- instagram_accounts — one row per connected Instagram professional account
-- ============================================================================

CREATE TABLE public.instagram_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  ig_business_account_id TEXT,
  ig_username TEXT,
  facebook_page_id TEXT,
  page_access_token TEXT,
  long_lived_user_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  status public.instagram_account_status NOT NULL DEFAULT 'pending',
  scopes TEXT[] NOT NULL DEFAULT '{}',
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  default_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  default_conversation_status_id UUID REFERENCES public.conversation_statuses(id) ON DELETE SET NULL,
  connected_at TIMESTAMP WITH TIME ZONE,
  disconnected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_instagram_accounts_org ON public.instagram_accounts(organization_id);
CREATE INDEX idx_instagram_accounts_workspace ON public.instagram_accounts(workspace_id);

-- ============================================================================
-- instagram_contacts — Instagram-scoped users (IGSID), never merged with contacts
-- ============================================================================

CREATE TABLE public.instagram_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  igsid TEXT NOT NULL,
  username TEXT,
  name TEXT,
  profile_pic_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (instagram_account_id, igsid)
);

CREATE INDEX idx_instagram_contacts_org ON public.instagram_contacts(organization_id);

-- Reuse the shared org-wide tags system via a dedicated join table
CREATE TABLE public.instagram_contact_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instagram_contact_id UUID NOT NULL REFERENCES public.instagram_contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  added_by UUID REFERENCES auth.users(id),
  added_by_type TEXT NOT NULL DEFAULT 'manual' CHECK (added_by_type IN ('manual', 'automation', 'ai')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (instagram_contact_id, tag_id)
);

-- ============================================================================
-- instagram_conversations / instagram_messages
-- ============================================================================

CREATE TABLE public.instagram_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.instagram_contacts(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  conversation_status_id UUID REFERENCES public.conversation_statuses(id) ON DELETE SET NULL,
  status public.conversation_status NOT NULL DEFAULT 'open',
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_message_direction public.message_direction,
  unread_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (instagram_account_id, contact_id)
);

CREATE INDEX idx_instagram_conversations_org ON public.instagram_conversations(organization_id);
CREATE INDEX idx_instagram_conversations_workspace ON public.instagram_conversations(workspace_id);
CREATE INDEX idx_instagram_conversations_last_message ON public.instagram_conversations(last_message_at DESC);

CREATE TABLE public.instagram_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.instagram_conversations(id) ON DELETE CASCADE,
  direction public.message_direction NOT NULL,
  type public.instagram_message_type NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  ig_message_id TEXT,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_from_bot BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_instagram_messages_conversation ON public.instagram_messages(conversation_id, created_at DESC);
CREATE UNIQUE INDEX idx_instagram_messages_ig_message_id ON public.instagram_messages(ig_message_id) WHERE ig_message_id IS NOT NULL;

-- ============================================================================
-- instagram_webhook_events — raw payload trail for debugging/replay
-- ============================================================================

CREATE TABLE public.instagram_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  instagram_account_id UUID REFERENCES public.instagram_accounts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_instagram_webhook_events_account ON public.instagram_webhook_events(instagram_account_id, created_at DESC);

-- ============================================================================
-- instagram_automation_rules / instagram_rule_executions
-- ============================================================================

CREATE TABLE public.instagram_automation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instagram_account_id UUID NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  -- Phase 1 only supports 'comment_keyword'. Kept as TEXT (not an enum) so later
  -- phases (dm_keyword, story_reply_keyword, mention) don't require an ALTER TYPE.
  trigger_type TEXT NOT NULL DEFAULT 'comment_keyword'
    CHECK (trigger_type IN ('comment_keyword')),
  -- { keywords: string[], match_type: 'any' | 'all', scope: 'all_posts' | 'specific_media', media_ids: string[] }
  trigger_config JSONB NOT NULL DEFAULT '{}',
  -- Ordered array of { type: 'like_comment'|'reply_comment_public'|'send_dm'|'create_contact'|'add_tag'|'notify_assignee', ...params }
  actions JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- { max_per_contact_per_day?: number, cooldown_seconds?: number }
  rate_limit JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_instagram_automation_rules_account ON public.instagram_automation_rules(instagram_account_id, is_active);

CREATE TABLE public.instagram_rule_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id UUID NOT NULL REFERENCES public.instagram_automation_rules(id) ON DELETE CASCADE,
  webhook_event_id UUID REFERENCES public.instagram_webhook_events(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.instagram_contacts(id) ON DELETE SET NULL,
  status public.instagram_execution_status NOT NULL,
  -- [{ type: string, status: 'success'|'error'|'skipped', detail?: string }]
  steps JSONB NOT NULL DEFAULT '[]',
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_instagram_rule_executions_rule ON public.instagram_rule_executions(rule_id, created_at DESC);

-- ============================================================================
-- updated_at triggers (reuse existing public.update_updated_at_column())
-- ============================================================================

CREATE TRIGGER set_updated_at_instagram_accounts
  BEFORE UPDATE ON public.instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at_instagram_contacts
  BEFORE UPDATE ON public.instagram_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at_instagram_conversations
  BEFORE UPDATE ON public.instagram_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at_instagram_automation_rules
  BEFORE UPDATE ON public.instagram_automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Row Level Security — mirrors the existing get_user_org_id()/has_role() pattern
-- used by whatsapp_instances/contacts/conversations/messages.
-- ============================================================================

ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_rule_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org Instagram accounts"
  ON public.instagram_accounts FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage Instagram accounts"
  ON public.instagram_accounts FOR ALL
  USING (
    organization_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Users can view Instagram contacts in their organization"
  ON public.instagram_contacts FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage Instagram contacts in their organization"
  ON public.instagram_contacts FOR ALL
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can view Instagram contact tags in their organization"
  ON public.instagram_contact_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instagram_contacts ic
      WHERE ic.id = instagram_contact_tags.instagram_contact_id
        AND ic.organization_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE POLICY "Users can manage Instagram contact tags in their organization"
  ON public.instagram_contact_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.instagram_contacts ic
      WHERE ic.id = instagram_contact_tags.instagram_contact_id
        AND ic.organization_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE POLICY "Users can view Instagram conversations in their organization"
  ON public.instagram_conversations FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage Instagram conversations in their organization"
  ON public.instagram_conversations FOR ALL
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can view Instagram messages from their org conversations"
  ON public.instagram_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instagram_conversations c
      WHERE c.id = instagram_messages.conversation_id
        AND c.organization_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE POLICY "Users can insert Instagram messages in their org conversations"
  ON public.instagram_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.instagram_conversations c
      WHERE c.id = instagram_messages.conversation_id
        AND c.organization_id = public.get_user_org_id(auth.uid())
    )
  );

CREATE POLICY "Users can view their org Instagram webhook events"
  ON public.instagram_webhook_events FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can view their org Instagram automation rules"
  ON public.instagram_automation_rules FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage Instagram automation rules"
  ON public.instagram_automation_rules FOR ALL
  USING (
    organization_id = public.get_user_org_id(auth.uid())
    AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'))
  );

CREATE POLICY "Users can view their org Instagram rule executions"
  ON public.instagram_rule_executions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.instagram_automation_rules r
      WHERE r.id = instagram_rule_executions.rule_id
        AND r.organization_id = public.get_user_org_id(auth.uid())
    )
  );

-- Edge functions use the service role key, which bypasses RLS entirely — no
-- explicit service-role policies are needed (same convention as whatsapp_instances).
