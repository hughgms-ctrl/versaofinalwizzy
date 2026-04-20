import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';
import type { CaseTemplate, CaseTemplateTask, CaseKind } from '@/types/operations';

export function useCaseTemplates() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['case-templates', profile?.organization_id],
    queryFn: async (): Promise<CaseTemplate[]> => {
      if (!profile?.organization_id) return [];
      const { data, error } = await (supabase as any)
        .from('case_templates')
        .select('*, category:case_categories(name,kind,color)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as CaseTemplate[];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useCaseTemplateTasks(templateId: string | null) {
  return useQuery({
    queryKey: ['case-template-tasks', templateId],
    queryFn: async (): Promise<CaseTemplateTask[]> => {
      if (!templateId) return [];
      const { data, error } = await (supabase as any)
        .from('case_template_tasks')
        .select('*')
        .eq('template_id', templateId)
        .order('order');
      if (error) throw error;
      return (data || []) as CaseTemplateTask[];
    },
    enabled: !!templateId,
  });
}

export function useCreateCaseTemplate() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      kind: CaseKind;
      category_id?: string | null;
      default_assignee_id?: string | null;
      default_status_id?: string | null;
      workspace_id?: string | null;
    }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const { data, error } = await (supabase as any)
        .from('case_templates')
        .insert({ ...input, organization_id: profile.organization_id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-templates'] });
      toast({ title: 'Template criado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateCaseTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<CaseTemplate>) => {
      const { error } = await (supabase as any).from('case_templates').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['case-templates'] }),
  });
}

export function useDeleteCaseTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('case_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-templates'] });
      toast({ title: 'Template removido' });
    },
  });
}

export function useCreateTemplateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      template_id: string;
      title: string;
      description?: string;
      days_to_due: number;
      order?: number;
      is_mandatory?: boolean;
      default_time?: string;
    }) => {
      const { error } = await (supabase as any).from('case_template_tasks').insert(input);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['case-template-tasks', v.template_id] }),
  });
}

export function useUpdateTemplateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<CaseTemplateTask>) => {
      const { error } = await (supabase as any).from('case_template_tasks').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['case-template-tasks'] }),
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteTemplateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('case_template_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['case-template-tasks'] }),
  });
}

export function useCaseTriggers() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['case-triggers', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];
      const { data, error } = await (supabase as any)
        .from('case_triggers')
        .select('*, template:case_templates(name,kind), pipeline:pipelines(name), column:pipeline_columns(name,color)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.organization_id,
  });
}

export function useCreateCaseTrigger() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: { pipeline_id: string; column_id: string; template_id: string }) => {
      if (!profile?.organization_id) throw new Error('Sem organização');
      const { error } = await (supabase as any)
        .from('case_triggers')
        .insert({ ...input, organization_id: profile.organization_id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case-triggers'] });
      toast({ title: 'Gatilho criado' });
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteCaseTrigger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('case_triggers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['case-triggers'] }),
  });
}
