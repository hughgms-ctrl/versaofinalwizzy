import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ContactNote {
  id: string;
  contact_id: string;
  organization_id: string;
  content: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  profile?: {
    full_name: string;
    avatar_url: string | null;
  } | null;
}

export function useContactNotes(contactId: string | null) {
  return useQuery({
    queryKey: ['contact-notes', contactId],
    queryFn: async () => {
      if (!contactId) return [];

      const { data, error } = await supabase
        .from('contact_notes')
        .select(`
          *,
          profile:profiles!contact_notes_created_by_fkey(full_name, avatar_url)
        `)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ContactNote[];
    },
    enabled: !!contactId,
  });
}

export function useAddContactNote() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ contactId, content }: { contactId: string; content: string }) => {
      // Get user's profile to get org_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const { data, error } = await supabase
        .from('contact_notes')
        .insert({
          contact_id: contactId,
          organization_id: profile.organization_id,
          content,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Sync to Uazapi Storage (Dual CRM)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.functions.invoke('zapi-crm', {
          body: { action: 'save', contactId, data: { content } },
          headers: { Authorization: `Bearer ${session?.access_token}` }
        });
      } catch (e) {
        console.warn('Failed to sync note to Uazapi Storage:', e);
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', variables.contactId] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-contact-note-counts'] });
      toast({
        title: 'Nota adicionada',
        description: 'A nota foi salva com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao adicionar nota',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateContactNote() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ noteId, content, contactId }: { noteId: string; content: string; contactId: string }) => {
      const { data, error } = await supabase
        .from('contact_notes')
        .update({ content })
        .eq('id', noteId)
        .select()
        .single();

      if (error) throw error;

      // Sync to Uazapi Storage (Dual CRM)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.functions.invoke('zapi-crm', {
          body: { action: 'save', contactId, data: { content } },
          headers: { Authorization: `Bearer ${session?.access_token}` }
        });
      } catch (e) {
        console.warn('Failed to sync note to Uazapi Storage:', e);
      }

      return { ...data, contactId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', data.contactId] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-contact-note-counts'] });
      toast({
        title: 'Nota atualizada',
        description: 'A nota foi atualizada com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar nota',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteContactNote() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ noteId, contactId }: { noteId: string; contactId: string }) => {
      const { error } = await supabase
        .from('contact_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      return { contactId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', data.contactId] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-contact-note-counts'] });
      toast({
        title: 'Nota removida',
        description: 'A nota foi removida com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao remover nota',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
