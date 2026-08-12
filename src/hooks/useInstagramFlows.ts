import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { InstagramTriggerType } from './useInstagramAutomationRules';

/**
 * Fluxos visuais do Instagram.
 *
 * Grafo no mesmo formato do construtor do WhatsApp (nodes/edges do React Flow),
 * mas em tabela e motor próprios — ver a decisão C2 em
 * docs/WIZZY_ENGAGE_PLANO_PRODUTO.md.
 */

/** Tipos de nó que o motor do Instagram entende. */
export type InstagramFlowNodeType =
  | 'start'
  | 'ig-message'
  | 'ig-delay'
  | 'ig-user-input'
  | 'ig-condition'
  | 'ig-action-tag'
  | 'ig-action-transfer'
  | 'ig-action-webhook';

export interface InstagramFlowNode {
  id: string;
  type: InstagramFlowNodeType;
  position: { x: number; y: number };
  data: Record<string, any>;
}

export interface InstagramFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface InstagramFlow {
  id: string;
  organization_id: string;
  instagram_account_id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: InstagramTriggerType;
  trigger_config: {
    keywords?: string[];
    match_type?: 'any' | 'all';
    scope?: 'all_posts' | 'specific_media';
    media_ids?: string[];
  };
  nodes: InstagramFlowNode[];
  edges: InstagramFlowEdge[];
  variables: Record<string, any>;
  triggers_count: number;
  created_at: string;
  updated_at: string;
}

export interface InstagramFlowExecution {
  id: string;
  flow_id: string;
  conversation_id: string;
  contact_id: string;
  status: 'running' | 'waiting_input' | 'waiting_delay' | 'completed' | 'failed' | 'cancelled';
  current_node_id: string | null;
  variables: Record<string, any>;
  execution_log: Array<{ nodeId: string; type: string; result: string; error?: string; at: string }>;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export function useInstagramFlows() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['instagram-flows', profile?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instagram_flows' as any)
        .select('*')
        .eq('organization_id', profile?.organization_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as InstagramFlow[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useInstagramFlow(flowId?: string | null) {
  return useQuery({
    queryKey: ['instagram-flow', flowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instagram_flows' as any)
        .select('*')
        .eq('id', flowId)
        .single();
      if (error) throw error;
      return data as unknown as InstagramFlow;
    },
    enabled: !!flowId,
  });
}

export function useUpsertInstagramFlow() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (flow: Partial<InstagramFlow> & { id?: string }) => {
      const payload: Record<string, any> = {
        organization_id: profile?.organization_id,
        instagram_account_id: flow.instagram_account_id,
        name: flow.name,
        description: flow.description ?? null,
        trigger_type: flow.trigger_type,
        trigger_config: flow.trigger_config ?? {},
        nodes: flow.nodes ?? [],
        edges: flow.edges ?? [],
      };
      // `is_active` só entra quando informado: salvar o desenho de um fluxo não
      // deve ligá-lo nem desligá-lo sem querer.
      if (flow.is_active !== undefined) payload.is_active = flow.is_active;

      if (flow.id) {
        const { data, error } = await supabase
          .from('instagram_flows' as any)
          .update(payload)
          .eq('id', flow.id)
          .select('*')
          .single();
        if (error) throw error;
        return data as unknown as InstagramFlow;
      }

      const { data, error } = await supabase
        .from('instagram_flows' as any)
        .insert({ ...payload, created_by: user?.id })
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as InstagramFlow;
    },
    onSuccess: (flow) => {
      queryClient.invalidateQueries({ queryKey: ['instagram-flows'] });
      queryClient.invalidateQueries({ queryKey: ['instagram-flow', flow?.id] });
    },
  });
}

export function useToggleInstagramFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('instagram_flows' as any)
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-flows'] });
    },
  });
}

export function useDeleteInstagramFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('instagram_flows' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instagram-flows'] });
    },
  });
}

/** Histórico de quem passou pelo fluxo — a aba de acompanhamento. */
export function useInstagramFlowExecutions(flowId?: string | null) {
  return useQuery({
    queryKey: ['instagram-flow-executions', flowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('instagram_flow_executions' as any)
        .select('*')
        .eq('flow_id', flowId)
        .order('started_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as InstagramFlowExecution[];
    },
    enabled: !!flowId,
  });
}
