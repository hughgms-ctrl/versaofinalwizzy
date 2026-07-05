import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

export interface Tag {
  id: string;
  name: string;
  color: string;
  description: string | null;
  organization_id: string;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactTag {
  id: string;
  contact_id: string;
  tag_id: string;
  added_by: string | null;
  added_by_type: 'manual' | 'flow' | 'ai';
  created_at: string;
  tag?: Tag;
}

export function useTags() {
  const { selectedWorkspaceId } = useWorkspaceContext();

  return useQuery({
    queryKey: ['tags', selectedWorkspaceId],
    queryFn: async () => {
      let query = supabase
        .from('tags' as any)
        .select('*')
        .order('name');

      // Filter by workspace: show tags for this workspace or without workspace
      if (selectedWorkspaceId) {
        query = query.or(`workspace_id.eq.${selectedWorkspaceId},workspace_id.is.null`);
      }

      const { data, error } = await query as { data: Tag[] | null; error: any };

      if (error) throw error;
      return (data || []) as Tag[];
    },
    staleTime: 10 * 60 * 1000, // FASE 4 (4D): config muda raramente
  });
}

// All tags without workspace filtering (for internal use like edge functions context)
export function useAllTags() {
  return useQuery({
    queryKey: ['all-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags' as any)
        .select('*')
        .order('name') as { data: Tag[] | null; error: any };

      if (error) throw error;
      return (data || []) as Tag[];
    },
    staleTime: 10 * 60 * 1000, // FASE 4 (4D): config muda raramente
  });
}

export function useContactTags(contactId: string | null) {
  return useQuery({
    queryKey: ['contact-tags', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_tags' as any)
        .select(`
          *,
          tag:tag_id(*)
        `)
        .eq('contact_id', contactId!);
      
      if (error) throw error;
      
      // Transform the response to match our expected type
      return (data || []).map((item: any) => ({
        ...item,
        tag: item.tag,
      })) as (ContactTag & { tag: Tag })[];
    },
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (tag: { name: string; color: string; description?: string; workspace_id?: string | null }): Promise<Tag> => {
      // Get org_id from profile
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();
      
      if (!profile) throw new Error('Perfil não encontrado');

      const { data, error } = await supabase
        .from('tags' as any)
        .insert({
          name: tag.name,
          color: tag.color,
          description: tag.description,
          workspace_id: tag.workspace_id || null,
          organization_id: profile.organization_id,
        })
        .select()
        .single() as { data: Tag | null; error: any };
      
      if (error) throw error;
      if (!data) throw new Error('Erro ao criar tag');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast({
        title: 'Tag criada',
        description: 'A tag foi criada com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao criar tag',
        description: error.message || 'Não foi possível criar a tag.',
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; color?: string; description?: string; workspace_id?: string | null }) => {
      const { data, error } = await supabase
        .from('tags' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast({
        title: 'Tag atualizada',
        description: 'A tag foi atualizada com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar tag',
        description: error.message || 'Não foi possível atualizar a tag.',
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_tag_safely' as any, { _tag_id: id });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['all-tags'] });
      queryClient.invalidateQueries({ queryKey: ['contact-tags'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['widgets'] });
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      toast({
        title: 'Tag excluída',
        description: 'A tag foi excluída com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao excluir tag',
        description: error.message || 'Não foi possível excluir a tag.',
        variant: 'destructive',
      });
    },
  });
}

export function useAddTagToContact() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ contactId, tagId, addedByType = 'manual' }: { contactId: string; tagId: string; addedByType?: 'manual' | 'flow' | 'ai' }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('contact_tags' as any)
        .insert({
          contact_id: contactId,
          tag_id: tagId,
          added_by: user?.id,
          added_by_type: addedByType,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contact-tags', variables.contactId] });
      if (variables.addedByType === 'manual') {
        supabase.functions.invoke('zapi-contact-tags', {
          body: { contactId: variables.contactId, tagId: variables.tagId },
        }).catch((error) => {
          console.warn('WhatsApp tag sync failed:', error);
        });
      }
    },
    onError: (error: any) => {
      if (error.code === '23505') {
        toast({
          title: 'Tag já atribuída',
          description: 'Este contato já possui esta tag.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Erro ao adicionar tag',
          description: error.message || 'Não foi possível adicionar a tag.',
          variant: 'destructive',
        });
      }
    },
  });
}

export function useRemoveTagFromContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, tagId }: { contactId: string; tagId: string }) => {
      const { error } = await supabase
        .from('contact_tags' as any)
        .delete()
        .eq('contact_id', contactId)
        .eq('tag_id', tagId);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contact-tags', variables.contactId] });
    },
  });
}
