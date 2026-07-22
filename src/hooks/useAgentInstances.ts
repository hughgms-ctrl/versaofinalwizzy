import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface AgentInstance {
  id: string;
  organization_id: string;
  template_id: string | null;
  flow_id: string;
  ai_agent_id: string;
  campaign_id: string | null;
  status: 'draft' | 'active' | 'paused';
}

// Todo agente criado pela orquestração (ver ApplyTemplateWizard) tem uma linha
// aqui; agentes criados pelo dialog antigo "Novo Agente" não têm -- por isso
// "Salvar como template" só aparece pra quem tem instanceId resolvido.
export function useAgentInstances() {
  return useQuery({
    queryKey: ['agent-instances'],
    queryFn: async (): Promise<AgentInstance[]> => {
      const { data, error } = await (supabase as any)
        .from('agent_instances')
        .select('id, organization_id, template_id, flow_id, ai_agent_id, campaign_id, status');
      if (error) throw error;
      return (data as AgentInstance[]) || [];
    },
    staleTime: 60_000,
  });
}

export interface AppliedTemplateInstance {
  id: string;
  templateId: string;
  status: 'draft' | 'active' | 'paused';
  workspaceId: string | null;
  workspaceName: string | null;
  phoneNumber: string | null;
  goalTagId: string | null;
}

// Pra "vitrine" da galeria: pra cada template já aplicado nesta organização,
// em qual workspace e número de WhatsApp está rodando -- assim o card mostra
// "Ativo em <workspace>" em vez de sempre oferecer "Aplicar template" de novo
// (ver conversa com o usuário). workspaceId vai junto pra dar pra restringir
// o selo "Ativo" ao workspace selecionado no topo (ver conversa: "mostre só
// os templates do determinado workspace").
export function useAppliedTemplateInstances() {
  return useQuery({
    queryKey: ['applied-template-instances'],
    queryFn: async (): Promise<AppliedTemplateInstance[]> => {
      const { data, error } = await (supabase as any)
        .from('agent_instances')
        .select('id, template_id, status, goal_tag_id, flow:flows(workspace:workspaces(id, name, whatsapp_instance:whatsapp_instances(phone_number)))')
        .not('template_id', 'is', null);
      if (error) throw error;
      return ((data as any[]) || []).map((row) => ({
        id: row.id as string,
        templateId: row.template_id as string,
        status: row.status,
        workspaceId: row.flow?.workspace?.id || null,
        workspaceName: row.flow?.workspace?.name || null,
        phoneNumber: row.flow?.workspace?.whatsapp_instance?.phone_number || null,
        goalTagId: row.goal_tag_id || null,
      }));
    },
    staleTime: 30_000,
  });
}

export interface AgentInstanceConversion {
  entries: number;
  conversions: number;
  rate: number | null; // null = sem dado suficiente (0 entradas)
}

// Conversão real de uma orquestração: quantos contatos entraram no fluxo dela
// e, desses, quantos têm a tag-objetivo aplicada (ver
// get_agent_instance_conversion). Só roda quando há objetivo definido -- sem
// tag, não tem o que calcular.
export function useAgentInstanceConversion(instanceId: string | null, hasGoal: boolean) {
  return useQuery({
    queryKey: ['agent-instance-conversion', instanceId],
    queryFn: async (): Promise<AgentInstanceConversion> => {
      const { data, error } = await (supabase as any).rpc('get_agent_instance_conversion', { _instance_id: instanceId });
      if (error) throw error;
      const row = (data as any[])?.[0] || { entries: 0, conversions: 0 };
      const entries = Number(row.entries) || 0;
      const conversions = Number(row.conversions) || 0;
      return { entries, conversions, rate: entries > 0 ? Math.round((conversions / entries) * 100) : null };
    },
    enabled: !!instanceId && hasGoal,
    staleTime: 30_000,
  });
}

export function useSaveAgentInstanceAsTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      instanceId: string;
      name: string;
      description?: string;
      category?: string;
      suggestedTriggerKeyword?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('apply-agent-template', {
        body: { action: 'save_as_template', ...params },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Erro ao salvar template');
      return data.template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-templates'] });
      toast({ title: 'Template salvo', description: 'Já está disponível pra reaplicar depois.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao salvar template', description: error.message, variant: 'destructive' });
    },
  });
}

// Importa um fluxo já existente (montado direto no Flow Builder, fora deste
// sistema) como orquestração -- sem criar fluxo/agente/campanha novos, só
// insere a linha de agent_instances linkando o que já existe (ver conversa
// com o usuário: "puxar um fluxo que já existe e transformar em orquestração").
// Insert direto do cliente -- RLS de agent_instances já libera qualquer
// membro da própria org (mesmo padrão de useCreateAIAgent).
export function useImportFlowAsInstance() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (params: { flowId: string; aiAgentId: string; campaignId: string | null }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      let status: 'draft' | 'active' | 'paused' = 'draft';
      if (params.campaignId) {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('is_active')
          .eq('id', params.campaignId)
          .maybeSingle();
        status = campaign?.is_active ? 'active' : 'paused';
      }
      const { error } = await (supabase as any).from('agent_instances').insert({
        organization_id: profile.organization_id,
        template_id: null,
        flow_id: params.flowId,
        ai_agent_id: params.aiAgentId,
        campaign_id: params.campaignId,
        status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-instances'] });
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast({ title: 'Fluxo importado', description: 'Agora ele aparece como orquestração em "Meus agentes".' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao importar fluxo', description: error.message, variant: 'destructive' });
    },
  });
}
