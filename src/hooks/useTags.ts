import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllContactTagLinks, type ContactTagLink } from '@/lib/contactTagLinks';
import { useToast } from '@/hooks/use-toast';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { normalizeWorkspaceId } from '@/lib/workspaceId';

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
      if (selectedWorkspaceId === 'unassigned') {
        // "Sem Workspace": só as tags globais
        query = query.is('workspace_id', null);
      } else if (selectedWorkspaceId) {
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

// All contact<->tag links, unfiltered by contact. Used to avoid firing one
// request per contact when rendering a list (e.g. conversation list badges).
//
// Paginado: um `.select()` solto aqui volta CORTADO no teto de linhas do
// PostgREST, e como isso chega como sucesso todo consumidor (badge da lista,
// filtro por tag do funil, filtro por permissao) simplesmente deixava de ver
// parte das ligacoes, sem erro nenhum.
export function useAllContactTags() {
  return useQuery({
    queryKey: ['all-contact-tags'],
    queryFn: fetchAllContactTagLinks,
  });
}

// Indice contato -> ids de tag, montado UMA vez por resposta de
// `all-contact-tags`.
//
// Cada linha da lista de conversas e cada card do funil faziam
// `allContactTags.filter(ct => ct.contact_id === id)` — uma varredura de TODOS
// os vinculos da organizacao por linha renderizada (O(conversas x vinculos) a
// cada render). Com o indice, a leitura por contato e direta.
//
// O WeakMap e chaveado pelo proprio array do cache: enquanto a resposta nao
// muda, todos os componentes reaproveitam o mesmo indice.
const contactTagIdsIndex = new WeakMap<ContactTagLink[], Map<string, string[]>>();
const EMPTY_TAG_IDS_MAP: Map<string, string[]> = new Map();
const EMPTY_TAG_IDS: string[] = [];

export function useContactTagIdsMap(): Map<string, string[]> {
  const { data } = useAllContactTags();

  return useMemo(() => {
    if (!data || data.length === 0) return EMPTY_TAG_IDS_MAP;

    const cached = contactTagIdsIndex.get(data);
    if (cached) return cached;

    const map = new Map<string, string[]>();
    for (const link of data) {
      const current = map.get(link.contact_id);
      if (current) current.push(link.tag_id);
      else map.set(link.contact_id, [link.tag_id]);
    }

    contactTagIdsIndex.set(data, map);
    return map;
  }, [data]);
}

/** Ids das tags de um contato, sem varrer a lista inteira. */
export function tagIdsOfContact(map: Map<string, string[]>, contactId: string | null | undefined): string[] {
  if (!contactId) return EMPTY_TAG_IDS;
  return map.get(contactId) ?? EMPTY_TAG_IDS;
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
      
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (profileError) throw profileError;
      if (!profile) throw new Error('Perfil não encontrado');

      const { data, error } = await supabase
        .from('tags' as any)
        .insert({
          name: tag.name,
          color: tag.color,
          description: tag.description,
          workspace_id: normalizeWorkspaceId(tag.workspace_id),
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
      const payload = 'workspace_id' in updates
        ? { ...updates, workspace_id: normalizeWorkspaceId(updates.workspace_id) }
        : updates;

      const { data, error } = await supabase
        .from('tags' as any)
        .update(payload)
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
          body: { contactId: variables.contactId, tagId: variables.tagId, action: 'add' },
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
      // Espelha a remoção na etiqueta do WhatsApp (best-effort, como no add).
      supabase.functions.invoke('zapi-contact-tags', {
        body: { contactId: variables.contactId, tagId: variables.tagId, action: 'remove' },
      }).catch((error) => {
        console.warn('WhatsApp tag unsync failed:', error);
      });
    },
  });
}
