-- The Notes feature (src/fluzz/pages/workspace/Notes*.tsx) and the RLS
-- policies in 20260605170000_wizzy_flow_workspace_access_policies.sql both
-- assumed public.notes / public.note_folders already existed, but no
-- migration ever created them, so PostgREST couldn't find the tables.

CREATE TABLE IF NOT EXISTS public.note_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  folder_order integer DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.note_folders(id) ON DELETE SET NULL,
  title text NOT NULL,
  content text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.note_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wizzy Flow workspace note folders access" ON public.note_folders;
CREATE POLICY "Wizzy Flow workspace note folders access"
  ON public.note_folders
  FOR ALL
  USING (
    workspace_id IS NOT NULL
    AND public.user_has_workspace_access(auth.uid(), workspace_id)
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.user_has_workspace_access(auth.uid(), workspace_id)
  );

DROP POLICY IF EXISTS "Wizzy Flow workspace notes access" ON public.notes;
CREATE POLICY "Wizzy Flow workspace notes access"
  ON public.notes
  FOR ALL
  USING (
    workspace_id IS NOT NULL
    AND public.user_has_workspace_access(auth.uid(), workspace_id)
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND public.user_has_workspace_access(auth.uid(), workspace_id)
  );

DROP TRIGGER IF EXISTS update_note_folders_updated_at ON public.note_folders;
CREATE TRIGGER update_note_folders_updated_at
  BEFORE UPDATE ON public.note_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_notes_updated_at ON public.notes;
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_note_folders_workspace ON public.note_folders(workspace_id, folder_order);
CREATE INDEX IF NOT EXISTS idx_notes_workspace_updated ON public.notes(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_folder ON public.notes(folder_id);

NOTIFY pgrst, 'reload schema';
