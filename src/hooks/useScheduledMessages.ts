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
  target_type: 'single' | 'tag' | 'manual' | 'group' | 'groups';
  contact_id: string | null;
  tag_id: string | null;
  group_jids: string[] | null;
  name: string | null;
  error_message: string | null;
  delay_between_contacts: number | null;
  batch_size_max: number | null;
  batch_pause_minutes: number | null;
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
  target_type: 'single' | 'tag' | 'manual' | 'phone' | 'group' | 'groups';
  contact_id?: string | null;
  tag_id?: string | null;
  contact_ids?: string[]; // For manual selection
  group_jids?: string[]; // For group / mass-group targets
  manual_phone?: string | null;
  manual_name?: string | null;
  name?: string | null;
  workspace_id?: string | null;
  delay_between_contacts?: number | null; // seconds between each contact
  batch_size_max?: number | null; // max lote size; system draws 1..max per batch (null/0 = off)
  batch_pause_minutes?: number | null; // pause (minutes) between batches
}

export interface UpdateScheduledMessageInput {
  id: string;
  scheduled_at?: string;
  recurrence_type?: 'once' | 'daily' | 'weekly' | 'monthly';
  recurrence_end_at?: string | null;
  content_type?: 'message' | 'flow';
  message_content?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  flow_id?: string | null;
  target_type?: 'single' | 'tag' | 'manual' | 'group' | 'groups';
  contact_id?: string | null;
  tag_id?: string | null;
  contact_ids?: string[];
  group_jids?: string[]; // For group / mass-group targets
  name?: string | null;
  delay_between_contacts?: number | null;
  batch_size_max?: number | null;
  batch_pause_minutes?: number | null;
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

      const { contact_ids, workspace_id, delay_between_contacts, manual_phone, manual_name, ...messageData } = input;
      let resolvedMessageData: Record<string, unknown> = { ...messageData };

      if (input.target_type === 'phone') {
        let formattedPhone = (manual_phone || '').replace(/\D/g, '');
        if (formattedPhone.length === 10 || formattedPhone.length === 11) {
          formattedPhone = `55${formattedPhone}`;
        }

        if (formattedPhone.length < 10) {
          throw new Error('Telefone inválido. Informe DDD e número.');
        }

        const { data: existingContact, error: existingError } = await supabase
          .from('contacts')
          .select('id, workspace_id')
          .eq('phone', formattedPhone)
          .eq('organization_id', profile.organization_id)
          .maybeSingle();

        if (existingError) throw existingError;

        let resolvedContactId = existingContact?.id;
        if (!resolvedContactId) {
          const { data: newContact, error: contactError } = await supabase
            .from('contacts')
            .insert({
              organization_id: profile.organization_id,
              phone: formattedPhone,
              name: manual_name?.trim() || null,
              workspace_id: workspace_id || null,
            } as any)
            .select('id')
            .single();

          if (contactError) throw contactError;
          resolvedContactId = newContact.id;
        } else if (workspace_id && existingContact.workspace_id !== workspace_id) {
          await supabase
            .from('contacts')
            .update({ workspace_id })
            .eq('id', resolvedContactId);
        }

        resolvedMessageData = {
          ...resolvedMessageData,
          target_type: 'single',
          contact_id: resolvedContactId,
          tag_id: null,
        };
      }

      // Create scheduled message
      const { data: scheduled, error } = await supabase
        .from('scheduled_messages')
        .insert({
          ...resolvedMessageData,
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

export function useUpdateScheduledMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateScheduledMessageInput) => {
      const { id, contact_ids, ...updateData } = input;

      // Update the scheduled message
      const updatePayload: any = { ...updateData };
      if (updateData.scheduled_at) {
        updatePayload.next_execution_at = updateData.scheduled_at;
      }

      const { error } = await supabase
        .from('scheduled_messages')
        .update(updatePayload)
        .eq('id', id);

      if (error) throw error;

      // If manual contacts changed, replace them
      if (contact_ids !== undefined) {
        // Delete existing
        await supabase
          .from('scheduled_message_contacts')
          .delete()
          .eq('scheduled_message_id', id);

        // Insert new
        if (contact_ids.length > 0) {
          const contactInserts = contact_ids.map(contactId => ({
            scheduled_message_id: id,
            contact_id: contactId,
          }));

          const { error: contactError } = await supabase
            .from('scheduled_message_contacts')
            .insert(contactInserts);

          if (contactError) throw contactError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] });
      toast({
        title: 'Agendamento atualizado',
        description: 'O agendamento foi atualizado com sucesso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar',
        description: error.message || 'Não foi possível atualizar o agendamento.',
        variant: 'destructive',
      });
    },
  });
}
