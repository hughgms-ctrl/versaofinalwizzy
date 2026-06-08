-- Tabela de grupos de WhatsApp (sincronizados da Evolution API via fetchAllGroups)
CREATE TABLE public.whatsapp_groups (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
    whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
    group_jid TEXT NOT NULL,              -- ex: 120363...@g.us
    name TEXT,
    description TEXT,
    picture_url TEXT,
    participant_count INTEGER NOT NULL DEFAULT 0,
    is_admin BOOLEAN NOT NULL DEFAULT false,   -- a instância conectada é admin do grupo?
    participants JSONB NOT NULL DEFAULT '[]',  -- [{jid, isAdmin}]
    raw JSONB,                                 -- payload bruto da Evolution
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (organization_id, group_jid)
);

CREATE INDEX idx_whatsapp_groups_org ON public.whatsapp_groups(organization_id);
CREATE INDEX idx_whatsapp_groups_workspace ON public.whatsapp_groups(workspace_id);

-- Enable RLS
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;

-- RLS Policies espelhando whatsapp_instances / contacts (acesso por organização do usuário)
CREATE POLICY "Users can view groups in their organization"
ON public.whatsapp_groups FOR SELECT
USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can manage groups in their organization"
ON public.whatsapp_groups FOR ALL
USING (organization_id = public.get_user_org_id(auth.uid()));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_whatsapp_groups_updated_at
BEFORE UPDATE ON public.whatsapp_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
