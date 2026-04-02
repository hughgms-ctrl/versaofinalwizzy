import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export interface ScheduledMessage {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  created_by: string | null;
  scheduled_at: string;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
  recurrence_type: 'once' | 'daily' | 'weekly' | 'monthly';
  recurrence_end_at: string | null;
  next_execution_at: string | null;
  last_executed_at: string | null;
  execution_count: number;
  content_type: 'message' | 'flow';
  message_content: string | null;
  media_url: string | null;
  media_type: string | null;
  flow_id: string | null;
  target_type: 'single' | 'tag' | 'manual';
  contact_id: string | null;
  tag_id: string | null;
  name: string | null;
  error_message: string | null;
  delay_between_contacts: number | null;
  created_at: string;
  updated_at: string;
  // Relations
  contact?: { id: string; name: string | null; phone: string } | null;
  tag?: { id: string; name: string; color: string } | null;
  flow?: { id: string; name: string } | null;
}

export interface CreateScheduledMessageInput {
  scheduled_at: string;
  recurrence_type?: 'once' | 'daily' | 'weekly' | 'monthly';
  recurrence_end_at?: string | null;
  content_type: 'message' | 'flow';
  message_content?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  flow_id?: string | null;
  target_type: 'single' | 'tag' | 'manual';
  contact_id?: string | null;
  tag_id?: string | null;
  contact_ids?: string[]; // For manual selection
  name?: string | null;
  workspace_id?: string | null;
  delay_between_contacts?: number | null; // seconds between each contact
}

export interface UpdateScheduledMessageInput {
  id: string;
  scheduled_at?: string;
  recurrence_type?: 'once' | 'daily' | 'weekly' | 'monthly';
  recurrence_end_at?: string | null;
  content_type?: 'message' | 'flow';
  message_content?: string | null;
  flow_id?: string | null;
  target_type?: 'single' | 'tag' | 'manual';
  contact_id?: string | null;
  tag_id?: string | null;
  contact_ids?: string[];
  name?: string | null;
  delay_between_contacts?: number | null;
}

export function useScheduledMessages() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['scheduled-messages'],
    queryFn: async (): Promise<ScheduledMessage[]> => {
      const { data, error } = await supabase
        .from('scheduled_messages')
        .select(`
          *,
          contact:contacts(id, name, phone),
          tag:tags(id, name, color),
          flow:flows(id, name)
        `)
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      return (data || []) as ScheduledMessage[];
    },
    enabled: !!session,
  });
}

export function useCreateScheduledMessage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateScheduledMessageInput) => {
      // Get user's organization
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', session!.user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const { contact_ids, workspace_id, delay_between_contacts, ...messageData } = input;

      // Create scheduled message
      const { data: scheduled, error } = await supabase
        .from('scheduled_messages')
        .insert({
          ...messageData,
          organization_id: profile.organization_id,
          created_by: session!.user.id,
          next_execution_at: input.scheduled_at,
          workspace_id: workspace_id || null,
          delay_between_contacts: delay_between_contacts || null,
        } as any)
        .select()
        .single();

      if (error) throw error;

      // If manual selection, insert contact associations
      if (input.target_type === 'manual' && contact_ids && contact_ids.length > 0) {
        const contactInserts = contact_ids.map(contactId => ({
          scheduled_message_id: scheduled.id,
          contact_id: contactId,
        }));

        const { error: contactError } = await supabase
          .from('scheduled_message_contacts')
          .insert(contactInserts);

        if (contactError) throw contactError;
      }

      return scheduled;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] });
      toast({
        title: 'Agendamento criado',
        description: 'A mensagem foi agendada com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao agendar',
        description: error.message || 'Não foi possível criar o agendamento.',
        variant: 'destructive',
      });
    },
  });
}

export function useCancelScheduledMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('scheduled_messages')
        .update({ status: 'cancelled' })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] });
      toast({
        title: 'Agendamento cancelado',
        description: 'O agendamento foi cancelado com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao cancelar',
        description: error.message || 'Não foi possível cancelar o agendamento.',
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteScheduledMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('scheduled_messages')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] });
      toast({
        title: 'Agendamento excluído',
        description: 'O agendamento foi excluído com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao excluir',
        description: error.message || 'Não foi possível excluir o agendamento.',
        variant: 'destructive',
      });
    },
  });
}
