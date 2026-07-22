import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AgentTemplate } from '@/components/agents/AgentTemplateGallery';

export interface AgentTemplateDetail {
  id: string;
  name: string;
  description: string;
  category: string | null;
  suggestedTriggerKeyword: string | null;
  flowSnapshot: { nodes?: any[]; edges?: any[] };
  agentSnapshot: { function_role?: string; prompt_base?: string; persona?: string };
}

// Detalhe completo (com os snapshots) só é buscado quando o usuário abre um
// template específico -- a lista da galeria não precisa desse peso todo.
export function useAgentTemplateDetail(templateId: string | null) {
  return useQuery({
    queryKey: ['agent-template-detail', templateId],
    queryFn: async (): Promise<AgentTemplateDetail | null> => {
      if (!templateId) return null;
      const { data, error } = await (supabase as any)
        .from('agent_templates')
        .select('id, name, description, category, suggested_trigger_keyword, flow_snapshot, agent_snapshot')
        .eq('id', templateId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        name: data.name,
        description: data.description || '',
        category: data.category,
        suggestedTriggerKeyword: data.suggested_trigger_keyword,
        flowSnapshot: data.flow_snapshot || {},
        agentSnapshot: data.agent_snapshot || {},
      };
    },
    enabled: !!templateId,
    staleTime: 60_000,
  });
}

// RLS de agent_templates já filtra o que cada um pode ver: linhas globais
// (organization_id null) published pra todo mundo, draft só pra admin de
// plataforma; linhas com organization_id = a própria org, de qualquer status,
// pros membros dela -- não precisa repetir esse filtro aqui, e o mesmo select
// já traz as duas camadas juntas.
// `as any`: agent_templates é recente (migration direta), ainda não está nos
// types gerados do Supabase — mesmo padrão já usado em outras tabelas novas do
// projeto (ex.: document_signers em ContactContractsSection.tsx).
export function useAgentTemplates() {
  return useQuery({
    queryKey: ['agent-templates'],
    queryFn: async (): Promise<AgentTemplate[]> => {
      const { data, error } = await (supabase as any)
        .from('agent_templates')
        .select('id, name, description, category, conversion_rate, status, organization_id, agent_function_role:agent_snapshot->>function_role')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data as any[]) || []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        category: row.category,
        conversionRate: row.conversion_rate || 0,
        status: row.status,
        isOwnOrg: row.organization_id !== null,
        agentFunctionRole: row.agent_function_role || null,
      }));
    },
    staleTime: 60_000,
  });
}

// Edição direta pelo cliente (sem edge function) -- a RLS de agent_templates
// já restringe escrita a admin de plataforma via is_platform_admin, então não
// precisa de uma camada extra de autorização aqui (ver conversa com o
// usuário: "quero ser capaz de editar ou excluir o template").
export function useUpdateAgentTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      name: string;
      description?: string | null;
      category?: string | null;
      status: 'draft' | 'published';
      suggestedTriggerKeyword?: string | null;
    }) => {
      const { error } = await (supabase as any)
        .from('agent_templates')
        .update({
          name: params.name,
          description: params.description || null,
          category: params.category || null,
          status: params.status,
          suggested_trigger_keyword: params.suggestedTriggerKeyword || null,
        })
        .eq('id', params.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agent-templates'] });
      queryClient.invalidateQueries({ queryKey: ['agent-template-detail', variables.id] });
      toast({ title: 'Template atualizado' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar template', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteAgentTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('agent_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-templates'] });
      toast({ title: 'Template excluído' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir template', description: error.message, variant: 'destructive' });
    },
  });
}
