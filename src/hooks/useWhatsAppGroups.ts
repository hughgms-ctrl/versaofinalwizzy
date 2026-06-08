import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from './use-toast';

export interface WhatsAppGroupParticipant {
  jid: string;
  isAdmin: boolean;
}

export interface WhatsAppGroup {
  id: string;
  organization_id: string;
  whatsapp_instance_id: string | null;
  group_jid: string;
  name: string | null;
  description: string | null;
  picture_url: string | null;
  participant_count: number;
  is_admin: boolean;
  participants: WhatsAppGroupParticipant[];
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// Read groups from the DB (populated by the sync action).
export function useWhatsAppGroups() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['whatsapp-groups'],
    queryFn: async (): Promise<WhatsAppGroup[]> => {
      const { data, error } = await (supabase as any)
        .from('whatsapp_groups')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []) as WhatsAppGroup[];
    },
    enabled: !!session,
  });
}

async function invokeGroups<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('zapi-groups', { body });
  if (error) throw new Error(error.message || 'Erro ao chamar zapi-groups');
  if (data?.error) throw new Error(data.error);
  return data as T;
}

// Sync the group list from the Evolution API into whatsapp_groups.
export function useSyncGroups() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => invokeGroups({ action: 'sync' }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
      toast({
        title: 'Grupos sincronizados',
        description: `${data?.synced ?? 0} grupo(s) atualizados.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao sincronizar',
        description: error.message || 'Não foi possível sincronizar os grupos.',
        variant: 'destructive',
      });
    },
  });
}

// Send a message to one or more groups.
export function useSendGroupMessage() {
  return useMutation({
    mutationFn: async ({
      groupJids,
      text,
      type = 'text',
      mediaUrl,
      caption,
    }: {
      groupJids: string[];
      text?: string | null;
      type?: 'text' | 'image' | 'video' | 'audio' | 'document';
      mediaUrl?: string | null;
      caption?: string | null;
    }) => {
      const results = [];
      for (const groupJid of groupJids) {
        const res = await invokeGroups({ action: 'send', groupJid, text, type, mediaUrl, caption });
        results.push(res);
      }
      return results;
    },
    onSuccess: (_data, vars) => {
      toast({
        title: 'Mensagem enviada',
        description: `Enviada para ${vars.groupJids.length} grupo(s).`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao enviar',
        description: error.message || 'Não foi possível enviar a mensagem.',
        variant: 'destructive',
      });
    },
  });
}

export function useGroupParticipants() {
  return useMutation({
    mutationFn: async (groupJid: string) => invokeGroups({ action: 'participants', groupJid }),
  });
}

export function useUpdateParticipants() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      groupJid,
      participantAction,
      participants,
    }: {
      groupJid: string;
      participantAction: 'add' | 'remove' | 'promote' | 'demote';
      participants: string[];
    }) => invokeGroups({ action: 'updateParticipant', groupJid, participantAction, participants }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
    },
    onError: (error: any) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subject,
      description,
      participants,
    }: {
      subject: string;
      description?: string;
      participants: string[];
    }) => invokeGroups({ action: 'create', subject, description, participants }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
      toast({ title: 'Grupo criado', description: 'O grupo foi criado com sucesso.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao criar grupo', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      groupJid,
      subject,
      description,
      image,
    }: {
      groupJid: string;
      subject?: string;
      description?: string;
      image?: string;
    }) => {
      if (subject !== undefined) await invokeGroups({ action: 'updateSubject', groupJid, subject });
      if (description !== undefined) await invokeGroups({ action: 'updateDescription', groupJid, description });
      if (image !== undefined) await invokeGroups({ action: 'updatePicture', groupJid, image });
      return { ok: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-groups'] });
      toast({ title: 'Grupo atualizado', description: 'As informações do grupo foram atualizadas.' });
    },
    onError: (error: any) => {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    },
  });
}
