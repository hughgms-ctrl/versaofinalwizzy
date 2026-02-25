import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface Contact {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  avatar_url: string | null;
  organization_id: string;
  created_at: string;
  updated_at: string;
  metadata: { note?: string } | null;
  tags?: {
    id: string;
    tag: {
      id: string;
      name: string;
      color: string;
    };
  }[];
}

export function useContacts() {
  const { session } = useAuth();
  
  return useQuery({
    queryKey: ['contacts'],
    queryFn: async (): Promise<Contact[]> => {
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          tags:contact_tags(
            id,
            tag:tags(id, name, color)
          )
        `)
        .order('created_at', { ascending: false });

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

export function useDeleteContact() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
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
