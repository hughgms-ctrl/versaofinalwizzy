import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export interface DocumentPack {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  template_ids: string[];
  workspace_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useDocumentPacks() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useQuery({
    queryKey: ['document-packs', orgId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('document_packs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DocumentPack[];
    },
    enabled: !!orgId,
  });
}

export function useCreateDocumentPack() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (pack: { name: string; description?: string; template_ids: string[] }) => {
      const { data, error } = await (supabase as any)
        .from('document_packs')
        .insert({
          ...pack,
          organization_id: profile!.organization_id,
          created_by: profile!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as DocumentPack;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-packs'] });
      toast({ title: 'Pack criado com sucesso' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao criar pack', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateDocumentPack() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DocumentPack> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from('document_packs')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as DocumentPack;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-packs'] });
      toast({ title: 'Pack atualizado' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar pack', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteDocumentPack() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('document_packs')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-packs'] });
      toast({ title: 'Pack excluído' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao excluir pack', description: error.message, variant: 'destructive' });
    },
  });
}
