
CREATE TABLE public.followup_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  quiet_hours boolean NOT NULL DEFAULT false,
  quiet_start text NOT NULL DEFAULT '22:00',
  quiet_end text NOT NULL DEFAULT '08:00',
  move_pipeline_id uuid DEFAULT NULL,
  move_column_id uuid DEFAULT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.followup_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own org followup templates"
  ON public.followup_templates
  FOR ALL
  TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE TRIGGER update_followup_templates_updated_at
  BEFORE UPDATE ON public.followup_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
