
CREATE TABLE public.conversation_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_by uuid REFERENCES auth.users(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

ALTER TABLE public.conversation_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shares in their org"
  ON public.conversation_shares FOR SELECT
  USING (organization_id = get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage shares in their org"
  ON public.conversation_shares FOR ALL
  USING (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    organization_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

CREATE INDEX idx_conversation_shares_user_id ON public.conversation_shares(user_id);
CREATE INDEX idx_conversation_shares_conversation_id ON public.conversation_shares(conversation_id);
CREATE INDEX idx_conversation_shares_org_id ON public.conversation_shares(organization_id);
