
-- Table: conversation_stage_history
CREATE TABLE public.conversation_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  from_column_id uuid REFERENCES public.pipeline_columns(id) ON DELETE SET NULL,
  to_column_id uuid NOT NULL REFERENCES public.pipeline_columns(id) ON DELETE CASCADE,
  changed_by_type text NOT NULL DEFAULT 'manual',
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
);

ALTER TABLE public.conversation_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stage history in their org"
  ON public.conversation_stage_history FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Users can insert stage history in their org"
  ON public.conversation_stage_history FOR INSERT
  WITH CHECK (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role can manage stage history"
  ON public.conversation_stage_history FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_stage_history_conversation ON public.conversation_stage_history(conversation_id);
CREATE INDEX idx_stage_history_org ON public.conversation_stage_history(organization_id);

-- Table: stage_notifications
CREATE TABLE public.stage_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES public.pipeline_columns(id) ON DELETE CASCADE,
  notify_user_ids uuid[] NOT NULL DEFAULT '{}',
  message_template text,
  is_active boolean NOT NULL DEFAULT true,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pipeline_id, column_id)
);

ALTER TABLE public.stage_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stage notifications in their org"
  ON public.stage_notifications FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage stage notifications"
  ON public.stage_notifications FOR ALL
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'))
  );
;
