import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

export interface Contact {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  avatar_url: string | null;
  organization_id: string;
  workspace_id?: string | null;
  created_at: string;
  updated_at: string;
  metadata: { note?: string; description?: string } | null;
  tags?: {
    id: string;
    tag: {
      id: string;
      name: string;
      color: string;
    };
  }[];
}

// Cap server-side: traz os N contatos mais recentes (created_at desc) em vez da
// tabela inteira. Busca/tag/data continuam client-side dentro desse conjunto, e
// a lista é virtualizada na UI. Se a contagem bater no cap, a UI avisa.
export const CONTACTS_CAP = 1000;

export function useContacts() {
  const { session } = useAuth();
  const { selectedWorkspaceId } = useWorkspaceContext();

  return useQuery({
    queryKey: ['contacts', selectedWorkspaceId],
    queryFn: async (): Promise<Contact[]> => {
      let query = supabase
        .from('contacts')
        .select(`
          *,
          tags:contact_tags(
            id,
            tag:tags(id, name, color)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(CONTACTS_CAP);

      if (selectedWorkspaceId) {
        if (selectedWorkspaceId === 'unassigned') {
          query = query.is('workspace_id', null);
        } else {
          query = query.eq('workspace_id', selectedWorkspaceId);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as Contact[];
    },
    enabled: !!session,
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Contact> }) => {
      const { error } = await supabase
        .from('contacts')
        .update(data)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: 'Contato atualizado',
        description: 'As informações do contato foram atualizadas.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao atualizar',
        description: 'Não foi possível atualizar o contato.',
        variant: 'destructive',
      });
    },
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (data: Partial<Contact>) => {
      if (!profile?.organization_id) throw new Error('Organization ID is required');

      // Format phone: ensure it has country code '55' for BR assuming 10 or 11 digits
      let formattedPhone = data.phone;
      if (formattedPhone) {
        formattedPhone = formattedPhone.replace(/\D/g, '');
        if (formattedPhone.length === 10 || formattedPhone.length === 11) {
          formattedPhone = `55${formattedPhone}`;
        }
      }

      // Check if contact with this phone already exists
      if (formattedPhone) {
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('phone', formattedPhone)
          .eq('organization_id', profile.organization_id)
          .limit(1)
          .maybeSingle();

        if (existingContact) {
          throw new Error('Já existe um contato com este telefone.');
        }
      }

      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({
          ...data,
          phone: formattedPhone || data.phone, // use formatted if available
          organization_id: profile.organization_id,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return newContact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao criar',
        description: error.message || 'Não foi possível criar o contato.',
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Delete conversations first to avoid foreign key constraint errors
      const { error: convError } = await supabase
        .from('conversations')
        .delete()
        .eq('contact_id', id);

      if (convError) console.error("Error deleting conversations:", convError);

      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: 'Contato removido',
        description: 'O contato foi removido com sucesso.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao remover',
        description: 'Não foi possível remover o contato.',
        variant: 'destructive',
      });
    },
  });
}
