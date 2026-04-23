import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface WorkspaceTemplate {
  id: string;
  organization_id: string;
  workspace_id: string;
  created_by: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  description: string | null;
  master_prompt: string | null;
  agents_template: any[];
  flows_template: any[];
  tags_template: any[];
  pipeline_template: Record<string, any>;
  source: 'scratch' | 'workspace_export' | 'cloned_from_package';
  source_package_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useWorkspaceTemplates(workspaceId?: string | null) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['workspace-templates', orgId, workspaceId || 'all'],
    queryFn: async (): Promise<WorkspaceTemplate[]> => {
      if (!orgId) return [];
      let q = supabase.from('workspace_templates' as any).select('*').eq('organization_id', orgId);
      if (workspaceId) q = q.eq('workspace_id', workspaceId);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WorkspaceTemplate[];
    },
    enabled: !!orgId,
  });
}

export function useCreateWorkspaceTemplateScratch() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useMutation({
    mutationFn: async (input: {
      workspace_id: string;
      name: string;
      icon?: string | null;
      color?: string | null;
      description?: string | null;
      master_prompt?: string | null;
    }) => {
      if (!orgId) throw new Error('Sem organização');
      const { data, error } = await supabase.from('workspace_templates' as any).insert({
        organization_id: orgId,
        workspace_id: input.workspace_id,
        name: input.name,
        icon: input.icon ?? null,
        color: input.color ?? null,
        description: input.description ?? null,
        master_prompt: input.master_prompt ?? null,
        source: 'scratch',
      } as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-templates'] });
      toast({ title: 'Template criado' });
    },
    onError: (err: any) => toast({ title: 'Erro ao criar', description: err.message, variant: 'destructive' }),
  });
}

export function useUpdateWorkspaceTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<WorkspaceTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from('workspace_templates' as any)
        .update(rest as any)
        .eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-templates'] });
      toast({ title: 'Template atualizado' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });
}

export function useDeleteWorkspaceTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workspace_templates' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-templates'] });
      toast({ title: 'Template excluído' });
    },
    onError: (err: any) => toast({ title: 'Erro', description: err.message, variant: 'destructive' }),
  });
}

export function useExportWorkspaceAsTemplate() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      workspace_id: string;
      name: string;
      icon?: string | null;
      color?: string | null;
      description?: string | null;
      master_prompt?: string | null;
      include_agent_ids?: string[];
      include_flow_ids?: string[];
      include_tag_ids?: string[];
      include_pipeline_id?: string | null;
      as_platform?: boolean;
      platform_kind?: 'area' | 'objective';
      parent_package_id?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke('export-workspace-as-template', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: input,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-templates'] });
      queryClient.invalidateQueries({ queryKey: ['platform-packages'] });
      toast({
        title: data?.target === 'platform_packages' ? 'Pacote da plataforma criado' : 'Template salvo',
      });
    },
    onError: (err: any) => toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' }),
  });
}

export function useCloneFromCatalog() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: { package_id: string; workspace_id: string }) => {
      const { data, error } = await supabase.functions.invoke('clone-package-to-workspace', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: input,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-templates'] });
      toast({ title: 'Pacote duplicado como template' });
    },
    onError: (err: any) => toast({ title: 'Erro ao duplicar', description: err.message, variant: 'destructive' }),
  });
}

export function useActivateWorkspaceTemplate() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (input: { template_id: string; workspace_id?: string | null }) => {
      const { data, error } = await supabase.functions.invoke('activate-package', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: { source: 'workspace', template_id: input.template_id, workspace_id: input.workspace_id || null },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['master-prompts'] });
      toast({ title: 'Template ativado!', description: 'Recursos prontos no workspace.' });
    },
    onError: (err: any) => toast({ title: 'Erro ao ativar', description: err.message, variant: 'destructive' }),
  });
}
