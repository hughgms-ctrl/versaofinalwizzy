-- Instagram channel — Phase 2: DM sequences (link button + delayed follow-up)
-- Adds tracked links (Wizzy's own short-link redirect, so we know when a
-- recipient clicked) and pending follow-ups (send message A after N minutes
-- if clicked, message B if not — mirrors the flow_executions/timeout_at
-- resume pattern already used for WhatsApp flow delays, but as dedicated
-- tables since Instagram automation rules aren't node-graph based).

CREATE TABLE public.instagram_tracked_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.instagram_automation_rules(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.instagram_contacts(id) ON DELETE CASCADE,
  destination_url TEXT NOT NULL,
  clicked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_instagram_tracked_links_org ON public.instagram_tracked_links(organization_id);

CREATE TABLE public.instagram_pending_followups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.instagram_automation_rules(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.instagram_contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.instagram_conversations(id) ON DELETE CASCADE,
  tracked_link_id UUID REFERENCES public.instagram_tracked_links(id) ON DELETE SET NULL,
  resume_at TIMESTAMP WITH TIME ZONE NOT NULL,
  -- { clicked_text: string, not_clicked_text: string }
  followup_config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'error')),
  error TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Polling query in instagram-process-followups: status='pending' AND resume_at <= now()
CREATE INDEX idx_instagram_pending_followups_due ON public.instagram_pending_followups(status, resume_at);

ALTER TABLE public.instagram_tracked_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_pending_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org Instagram tracked links"
  ON public.instagram_tracked_links FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can view their org Instagram pending followups"
  ON public.instagram_pending_followups FOR SELECT
  USING (organization_id = public.get_user_org_id(auth.uid()));

-- Edge functions use the service role key (bypasses RLS) for all writes —
-- same convention as the rest of the Instagram channel tables.
