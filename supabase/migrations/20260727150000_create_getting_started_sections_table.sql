-- Onboarding feature (src/fluzz/pages/workspace/GettingStarted*.tsx) queries
-- getting_started_sections, which was never created by a migration.

CREATE TABLE IF NOT EXISTS public.getting_started_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  content_type text NOT NULL,
  content text,
  image_url text,
  video_url text,
  section_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.getting_started_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wizzy Flow workspace getting started sections access" ON public.getting_started_sections;
CREATE POLICY "Wizzy Flow workspace getting started sections access"
  ON public.getting_started_sections
  FOR ALL
  USING (public.user_has_workspace_access(auth.uid(), workspace_id))
  WITH CHECK (public.user_has_workspace_access(auth.uid(), workspace_id));

DROP TRIGGER IF EXISTS update_getting_started_sections_updated_at ON public.getting_started_sections;
CREATE TRIGGER update_getting_started_sections_updated_at
  BEFORE UPDATE ON public.getting_started_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_getting_started_sections_workspace_order ON public.getting_started_sections(workspace_id, section_order);

NOTIFY pgrst, 'reload schema';
