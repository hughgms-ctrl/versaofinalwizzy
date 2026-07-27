-- Culture/Vision pages (src/fluzz/pages/workspace/Culture.tsx, Vision.tsx and
-- their *Form.tsx counterparts) query company_info by (workspace_id, section)
-- expecting a single row (.maybeSingle()); the table was never migrated.

CREATE TABLE IF NOT EXISTS public.company_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  section text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  mission text,
  vision text,
  values text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (workspace_id, section)
);

ALTER TABLE public.company_info ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wizzy Flow workspace company info access" ON public.company_info;
CREATE POLICY "Wizzy Flow workspace company info access"
  ON public.company_info
  FOR ALL
  USING (
    workspace_id IS NOT NULL
    AND public.user_has_workspace_access(auth.uid(), workspace_id)
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.user_has_workspace_access(auth.uid(), workspace_id)
  );

DROP TRIGGER IF EXISTS update_company_info_updated_at ON public.company_info;
CREATE TRIGGER update_company_info_updated_at
  BEFORE UPDATE ON public.company_info
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
