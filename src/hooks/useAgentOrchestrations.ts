import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { confirmDialog } from '@/lib/confirmDialog';

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
  aiAgentId: string | null;
  status: 'draft' | 'active' | 'paused';
  isActive: boolean;
  workspaceId: string | null;
  workspaceIds: string[];
  functionRole: string | null;
  goalTagId: string | null;
  // true = fluxo criado especificamente pra essa orquestração (do zero ou via
  // template); false = fluxo importado, já existia antes -- ver
  // useDeleteOrchestration.
  flowCreatedByWizard: boolean;
}

const ORCHESTRATION_SELECT = 'id, ai_agent_id, campaign_id, flow_id, status, goal_tag_id, flow_created_by_wizard, flow:flows(name, is_active, workspace_id, workspace_ids), agent:ai_agents(function_role)';

function mapOrchestrationRow(row: any): AgentOrchestration {
  return {
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
    flowCreatedByWizard: !!row.flow_created_by_wizard,
  };
}

export function useAgentOrchestrations() {
  return useQuery({
    queryKey: ['agent-orchestrations'],
    queryFn: async (): Promise<AgentOrchestration[]> => {
      const { data, error } = await (supabase as any)
        .from('agent_instances')
        .select(ORCHESTRATION_SELECT)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data as any[]) || []).map(mapOrchestrationRow);
    },
    staleTime: 30_000,
  });
}

// Pra mostrar a faixa de contexto ("← Voltar para Agentes" + switch de Ativo)
// no Flow Builder quando o fluxo aberto pertence a uma orquestração -- sem
// precisar de query param nenhum, só olha se existe agent_instances pra este
// flow_id (ver redesenho: criação/edição de orquestração agora acontece
// direto no Flow Builder real, esta é a "cola" entre as duas telas).
export function useOrchestrationForFlow(flowId: string | null) {
  return useQuery({
    queryKey: ['orchestration-for-flow', flowId],
    queryFn: async (): Promise<AgentOrchestration | null> => {
      const { data, error } = await (supabase as any)
        .from('agent_instances')
        .select(ORCHESTRATION_SELECT)
        .eq('flow_id', flowId)
        .maybeSingle();
      if (error) throw error;
      return data ? mapOrchestrationRow(data) : null;
    },
    enabled: !!flowId,
    staleTime: 10_000,
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

// Regra de exclusão (ver conversa com o usuário):
// - O agente base NUNCA é apagado aqui -- fica "quietinho", reaproveitável em
//   outra orquestração.
// - A campanha é SEMPRE apagada junto (ela só existe pra disparar esta
//   orquestração específica).
// - O fluxo só é apagado se foi CRIADO por esta orquestração
//   (flowCreatedByWizard) -- e mesmo assim, pergunta antes. Um fluxo
//   IMPORTADO (ImportFlowDialog) pré-existia e pode estar em uso em outro
//   lugar -- nunca é tocado automaticamente.
export function useDeleteOrchestration() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (orchestration: AgentOrchestration): Promise<'cancelled' | 'deleted'> => {
      const confirmed = await confirmDialog(
        `Isso apaga a campanha vinculada a "${orchestration.name}". O agente de IA continua disponível pra usar em outra orquestração.`,
        { title: 'Excluir orquestração', confirmLabel: 'Excluir', variant: 'destructive' }
      );
      if (!confirmed) return 'cancelled' as const;

      let flowDeleted = false;
      if (orchestration.flowCreatedByWizard) {
        flowDeleted = await confirmDialog(
          `Ele foi criado especificamente pra essa orquestração. Essa ação não pode ser desfeita.`,
          { title: `Apagar também o fluxo "${orchestration.name}"?`, confirmLabel: 'Apagar fluxo', cancelLabel: 'Manter fluxo', variant: 'destructive' }
        );
      }

      if (flowDeleted) {
        // Apaga o fluxo -- campanha (campaigns.flow_id) e a própria linha de
        // agent_instances (agent_instances.flow_id) já vêm em cascata.
        const { data, error } = await supabase.from('flows').delete().eq('id', orchestration.flowId).select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('Nenhum fluxo foi apagado -- você pode não ter permissão para excluir este item.');
        }
        return 'deleted';
      }

      if (orchestration.campaignId) {
        const { data, error } = await supabase.from('campaigns').delete().eq('id', orchestration.campaignId).select('id');
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error('Nenhuma campanha foi apagada -- você pode não ter permissão para excluir este item.');
        }
      }
      const { data, error } = await (supabase as any).from('agent_instances').delete().eq('id', orchestration.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Nenhuma orquestração foi apagada -- você pode não ter permissão para excluir este item.');
      }
      return 'deleted';
    },
    onSuccess: (result) => {
      if (result === 'cancelled') return;
      queryClient.invalidateQueries({ queryKey: ['agent-orchestrations'] });
      queryClient.invalidateQueries({ queryKey: ['agent-usage-counts'] });
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast({ title: 'Orquestração excluída', description: 'O agente base continua disponível pra usar em outra orquestração.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir orquestração', description: error.message, variant: 'destructive' });
    },
  });
}
