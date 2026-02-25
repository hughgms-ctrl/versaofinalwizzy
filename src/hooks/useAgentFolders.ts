import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface AgentFolder {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export function useAgentFolders() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['agent-folders'],
    queryFn: async (): Promise<AgentFolder[]> => {
      const { data, error } = await supabase
        .from('agent_folders')
        .select('*')
        .order('name');

      if (error) throw error;
      return (data || []) as unknown as AgentFolder[];
    },
    enabled: !!session,
  });
}

export function useCreateAgentFolder() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (name: string) => {
      if (!profile?.organization_id) throw new Error('No organization');
      const { data, error } = await supabase
        .from('agent_folders')
        .insert({ name, organization_id: profile.organization_id } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-folders'] });
      toast({ title: 'Pasta criada com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar pasta', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteAgentFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('agent_folders')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-folders'] });
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      toast({ title: 'Pasta excluída com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao excluir pasta', description: error.message, variant: 'destructive' });
    },
  });
}

export function useRenameAgentFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('agent_folders')
        .update({ name } as any)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-folders'] });
      toast({ title: 'Pasta renomeada com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao renomear pasta', description: error.message, variant: 'destructive' });
    },
  });
}
