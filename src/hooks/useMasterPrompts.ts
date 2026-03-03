import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface TriggerKeyword {
  value: string;
  match_type: 'exact' | 'contains' | 'starts_with';
}

export interface MasterPrompt {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  name: string;
  niche: string;
  content: string;
  agent_sequence: any[];
  agent_rules: Record<string, any>;
  is_active: boolean;
  trigger_type: 'disabled' | 'tag' | 'keyword';
  trigger_tags: string[];
  trigger_keywords: TriggerKeyword[];
  provider?: string | null;
  model?: string | null;
  created_at: string;
  updated_at: string;
}

export function useMasterPrompts() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['master-prompts'],
    queryFn: async (): Promise<MasterPrompt[]> => {
      const { data, error } = await supabase
        .from('master_prompts' as any)
        .select('*')
        .order('created_at');

      if (error) throw error;
      return (data || []) as unknown as MasterPrompt[];
    },
    enabled: !!session,
  });
}

export function useCreateMasterPrompt() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (prompt: {
      name: string;
      niche: string;
      content: string;
      agent_sequence?: any[];
      agent_rules?: Record<string, any>;
      workspace_id?: string | null;
    }) => {
      if (!profile?.organization_id) throw new Error('No organization');
      const { data, error } = await supabase
        .from('master_prompts' as any)
        .insert({
          ...prompt,
          organization_id: profile.organization_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['master-prompts'] });
      toast({ title: 'Prompt Mestre criado com sucesso' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar Prompt Mestre', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateMasterPrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MasterPrompt> & { id: string }) => {
      const { data, error } = await supabase
        .from('master_prompts' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['master-prompts'] });
      toast({ title: 'Prompt Mestre atualizado' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteMasterPrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('master_prompts' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['master-prompts'] });
      toast({ title: 'Prompt Mestre excluído' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    },
  });
}
