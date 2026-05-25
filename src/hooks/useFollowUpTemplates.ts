import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface FollowUpTemplate {
  id: string;
  organization_id: string;
  name: string;
  steps: any[];
  quiet_hours: boolean;
  quiet_start: string;
  quiet_end: string;
  move_pipeline_id: string | null;
  move_column_id: string | null;
  created_at: string;
}

export function useFollowUpTemplates() {
  const { session, profile } = useAuth();

  return useQuery({
    queryKey: ['followup-templates'],
    queryFn: async (): Promise<FollowUpTemplate[]> => {
      const { data, error } = await (supabase as any)
        .from('followup_templates')
        .select('*')
        .eq('organization_id', profile!.organization_id)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!session && !!profile?.organization_id,
  });
}

export function useSaveFollowUpTemplate() {
  const queryClient = useQueryClient();
  const { session, profile } = useAuth();

  return useMutation({
    mutationFn: async (template: {
      name: string;
      steps: any[];
      quiet_hours: boolean;
      quiet_start: string;
      quiet_end: string;
      move_pipeline_id?: string | null;
      move_column_id?: string | null;
    }) => {
      const { error } = await (supabase as any)
        .from('followup_templates')
        .insert({
          organization_id: profile!.organization_id,
          name: template.name,
          steps: template.steps,
          quiet_hours: template.quiet_hours,
          quiet_start: template.quiet_start,
          quiet_end: template.quiet_end,
          move_pipeline_id: template.move_pipeline_id || null,
          move_column_id: template.move_column_id || null,
          created_by: session!.user.id,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followup-templates'] });
      toast({ title: 'Modelo salvo com sucesso!' });
    },
    onError: () => {
      toast({ title: 'Erro ao salvar modelo', variant: 'destructive' });
    },
  });
}

export function useDeleteFollowUpTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('followup_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followup-templates'] });
      toast({ title: 'Modelo excluído' });
    },
  });
}
