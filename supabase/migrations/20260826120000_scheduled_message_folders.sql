-- Pastas para a aba "Programados" (espelha campaign_folders / flow_folders).
-- Guardas IF NOT EXISTS porque a migration é aplicada à mão no SQL Editor e
-- pode ser rodada duas vezes sem querer.

CREATE TABLE IF NOT EXISTS public.scheduled_message_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.scheduled_message_folders(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  workspace_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Apagar a pasta NÃO apaga o que está dentro: a programação volta para a raiz.
ALTER TABLE public.scheduled_messages
ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.scheduled_message_folders(id) ON DELETE SET NULL;

ALTER TABLE public.scheduled_message_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view scheduled message folders in their organization" ON public.scheduled_message_folders;
CREATE POLICY "Users can view scheduled message folders in their organization"
ON public.scheduled_message_folders
FOR SELECT
USING (organization_id = get_user_org_id(auth.uid()));

DROP POLICY IF EXISTS "Users can manage scheduled message folders in their organization" ON public.scheduled_message_folders;
CREATE POLICY "Users can manage scheduled message folders in their organization"
ON public.scheduled_message_folders
FOR ALL
USING (organization_id = get_user_org_id(auth.uid()))
WITH CHECK (organization_id = get_user_org_id(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_folder_id ON public.scheduled_messages(folder_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_message_folders_organization_id ON public.scheduled_message_folders(organization_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_message_folders_parent_id ON public.scheduled_message_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_message_folders_workspace_ids ON public.scheduled_message_folders USING GIN(workspace_ids);

DROP TRIGGER IF EXISTS update_scheduled_message_folders_updated_at ON public.scheduled_message_folders;
CREATE TRIGGER update_scheduled_message_folders_updated_at
BEFORE UPDATE ON public.scheduled_message_folders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
