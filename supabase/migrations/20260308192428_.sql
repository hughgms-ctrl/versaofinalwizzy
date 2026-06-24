
-- Add workspace_id to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- Add workspace_id to conversations
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- Add workspace_id to campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;

-- Create index for faster workspace filtering
CREATE INDEX IF NOT EXISTS idx_contacts_workspace_id ON public.contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_id ON public.conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_id ON public.campaigns(workspace_id);
;
