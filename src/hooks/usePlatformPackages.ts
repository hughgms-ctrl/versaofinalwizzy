import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface PlatformPackage {
  id: string;
  kind: 'area' | 'objective';
  parent_package_id: string | null;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  description: string | null;
  master_prompt: string | null;
  agents_template: any[];
  flows_template: any[];
  tags_template: any[];
  pipeline_template: Record<string, any>;
  is_published: boolean;
  is_locked: boolean;
  is_clonable: boolean;
  allow_post_edit: boolean;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ActivatedPackage {
  id: string;
  organization_id: string;
  package_id: string;
  activated_version: number;
  activated_at: string;
  activated_by: string | null;
  metadata: Record<string, any>;
}

export function usePlatformPackages(filter?: { kind?: 'area' | 'objective'; parentId?: string | null }) {
  return useQuery({
    queryKey: ['platform-packages', filter],
    queryFn: async (): Promise<PlatformPackage[]> => {
      let q = supabase.from('platform_packages' as any).select('*').order('sort_order');
      if (filter?.kind) q = q.eq('kind', filter.kind);
      if (filter?.parentId !== undefined) {
        if (filter.parentId === null) q = q.is('parent_package_id', null);
        else q = q.eq('parent_package_id', filter.parentId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as PlatformPackage[];
    },
  });
}

export function useActivatedPackages() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  return useQuery({
    queryKey: ['activated-packages', orgId],
    queryFn: async (): Promise<ActivatedPackage[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('activated_packages' as any)
        .select('*')
        .eq('organization_id', orgId);
      if (error) throw error;
      return (data || []) as unknown as ActivatedPackage[];
    },
    enabled: !!orgId,
  });
}

export function useActivatePackage() {
  const queryClient = useQueryClient();
  const { profile, session } = useAuth();
  const orgId = profile?.organization_id;

  return useMutation({
    mutationFn: async (packageId: string) => {
      if (!orgId) throw new Error('Sem organização');
      const { data, error } = await supabase.functions.invoke('activate-package', {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
        body: { package_id: packageId, organization_id: orgId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activated-packages', orgId] });
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['master-prompts'] });
      toast({ title: 'Pacote ativado!', description: 'Recursos prontos para uso.' });
    },
    onError: (err: any) => {
      toast({
        title: 'Erro ao ativar pacote',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpsertPlatformPackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pkg: Partial<PlatformPackage> & { id?: string }) => {
      const payload: any = { ...pkg };
      if (payload.id) {
        const { id, created_at, updated_at, ...rest } = payload;
        const { data, error } = await supabase
          .from('platform_packages' as any)
          .update(rest)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { created_at, updated_at, id, ...rest } = payload;
      const { data, error } = await supabase
        .from('platform_packages' as any)
        .insert(rest)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-packages'] });
      toast({ title: 'Pacote salvo' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    },
  });
}

export function useDeletePlatformPackage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('platform_packages' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-packages'] });
      toast({ title: 'Pacote excluído' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
    },
  });
}
