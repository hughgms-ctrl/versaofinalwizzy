import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Uma orquestração é uma entidade PRÓPRIA -- fluxo + campanha + agente(s) por
// trás -- com nome e cartão SEPARADOS do agente base que ela usa (ver
// conversa com o usuário: "o agente simples fica quietinho lá... a
// orquestração vai aparecer separado"). O nome exibido é o do FLUXO (que já é
// digitado pelo usuário na criação/importação), nunca o nome do agente.
export interface AgentOrchestration {
  id: string; // agent_instances.id
  name: string; // flows.name
  flowId: string;
  campaignId: string | null;
  aiAgentId: string;
  status: 'draft' | 'active' | 'paused';
  isActive: boolean;
  workspaceId: string | null;
  workspaceIds: string[];
  functionRole: string | null;
  goalTagId: string | null;
}

export function useAgentOrchestrations() {
  return useQuery({
    queryKey: ['agent-orchestrations'],
    queryFn: async (): Promise<AgentOrchestration[]> => {
      const { data, error } = await (supabase as any)
        .from('agent_instances')
        .select('id, ai_agent_id, campaign_id, flow_id, status, goal_tag_id, flow:flows(name, is_active, workspace_id, workspace_ids), agent:ai_agents(function_role)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data as any[]) || []).map((row) => ({
        id: row.id,
        name: row.flow?.name || 'Orquestração sem nome',
        flowId: row.flow_id,
        campaignId: row.campaign_id,
        aiAgentId: row.ai_agent_id,
        status: row.status,
        isActive: !!row.flow?.is_active,
        workspaceId: row.flow?.workspace_id || null,
        workspaceIds: Array.isArray(row.flow?.workspace_ids) ? row.flow.workspace_ids : [],
        functionRole: row.agent?.function_role || null,
        goalTagId: row.goal_tag_id,
      }));
    },
    staleTime: 30_000,
  });
}

// Em quantas orquestrações cada agente é usado -- conta tanto o "agente
// principal" (agent_instances.ai_agent_id) quanto qualquer agente encadeado
// no meio de uma orquestração multi-agente (nó ai-handoff dentro do grafo do
// fluxo) -- não existe uma tabela própria de N-pra-N, então isso varre os
// nós dos fluxos já vinculados a alguma instância.
export function useAgentUsageCounts() {
  return useQuery({
    queryKey: ['agent-usage-counts'],
    queryFn: async (): Promise<Map<string, number>> => {
      const { data: instances, error } = await (supabase as any)
        .from('agent_instances')
        .select('flow_id');
      if (error) throw error;
      const flowIds = Array.from(new Set((instances as any[] || []).map((i) => i.flow_id))).filter(Boolean);
      if (flowIds.length === 0) return new Map();

      const { data: flows, error: flowsError } = await supabase
        .from('flows')
        .select('id, nodes')
        .in('id', flowIds);
      if (flowsError) throw flowsError;

      const counts = new Map<string, number>();
      for (const flow of (flows as any[]) || []) {
        const agentIdsInFlow = new Set<string>();
        for (const node of (flow.nodes as any[]) || []) {
          if (node.type === 'ai-handoff' && node.data?.agentId) agentIdsInFlow.add(node.data.agentId);
        }
        for (const agentId of agentIdsInFlow) {
          counts.set(agentId, (counts.get(agentId) || 0) + 1);
        }
      }
      return counts;
    },
    staleTime: 30_000,
  });
}

// Liga/desliga a orquestração inteira -- fluxo + campanha + status da
// instância juntos, direto pelos ids (não passa mais pelo toggle do agente,
// já que o agente base não é mais a mesma entidade que a orquestração).
export function useToggleOrchestration() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: { instanceId: string; flowId: string; campaignId: string | null; isActive: boolean }) => {
      await supabase.from('flows').update({ is_active: params.isActive }).eq('id', params.flowId);
      if (params.campaignId) {
        await supabase.from('campaigns').update({ is_active: params.isActive }).eq('id', params.campaignId);
      }
      await (supabase as any)
        .from('agent_instances')
        .update({ status: params.isActive ? 'active' : 'paused' })
        .eq('id', params.instanceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-orchestrations'] });
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast({ title: 'Orquestração atualizada' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar orquestração', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteOrchestration() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      // Remove só a linha de agent_instances -- o agente base, o fluxo e a
      // campanha continuam existindo (o agente volta a ficar "quietinho",
      // reaproveitável em outra orquestração; fluxo/campanha ficam órfãos,
      // removíveis à parte em Fluxos/Campanhas se o usuário quiser).
      const { error } = await (supabase as any).from('agent_instances').delete().eq('id', instanceId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-orchestrations'] });
      queryClient.invalidateQueries({ queryKey: ['agent-usage-counts'] });
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast({ title: 'Orquestração excluída', description: 'O agente base continua disponível pra usar em outra orquestração.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir orquestração', description: error.message, variant: 'destructive' });
    },
  });
}
