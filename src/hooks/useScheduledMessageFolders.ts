import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from './useAuth';

export interface ScheduledMessageFolder {
  id: string;
  organization_id: string;
  name: string;
  parent_id: string | null;
  workspace_id: string | null;
  workspace_ids: string[];
  created_at: string;
  updated_at: string;
}

// scheduled_message_folders ainda não está nos types gerados (a migration é
// aplicada à mão), então o nome da tabela é castado como as demais tabelas
// novas do projeto — ver useInstagramAccounts.ts.
const FOLDERS = 'scheduled_message_folders' as 'contacts';

/** A migration ainda não subiu: tabela/coluna inexistente no schema cache. */
export const isMissingSchema = (error: any) =>
  error?.code === '42P01' ||
  error?.code === '42703' ||
  error?.code === 'PGRST204' ||
  error?.code === 'PGRST205' ||
  String(error?.message || '').includes('scheduled_message_folders') ||
  String(error?.message || '').includes('folder_id');

const schemaPendingMessage =
  'Atualização do banco ainda não aplicada — as pastas ficam disponíveis assim que a migration subir.';

const notifyError = (error: any, fallback: string) => {
  toast({
    title: fallback,
    description: isMissingSchema(error)
      ? schemaPendingMessage
      : error?.message || 'Erro desconhecido.',
    variant: 'destructive',
  });
};

export function useScheduledMessageFolders() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['scheduled-message-folders'],
    queryFn: async (): Promise<ScheduledMessageFolder[]> => {
      const { data, error } = await (supabase
        .from(FOLDERS)
        .select('*')
        .order('name') as unknown as Promise<{ data: any[] | null; error: any }>);

      if (error) {
        // Sem a migration a aba inteira não pode quebrar: seguimos sem pastas.
        if (isMissingSchema(error)) {
          console.warn('[scheduled-message-folders] tabela ainda não existe:', error);
          return [];
        }
        // Falhar em silêncio faria a tela mostrar "nenhuma pasta" como se o
        // banco estivesse vazio (RLS, rede, schema cache...).
        console.error('[scheduled-message-folders] falha ao carregar pastas:', error);
        throw error;
      }

      return (data || []).map((folder: any) => ({
        ...folder,
        workspace_ids: Array.isArray(folder.workspace_ids) ? folder.workspace_ids : [],
      })) as ScheduledMessageFolder[];
    },
    enabled: !!session,
  });
}

export function useCreateScheduledMessageFolder() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      parentId,
      workspaceIds,
    }: {
      name: string;
      parentId?: string | null;
      workspaceIds?: string[] | null;
    }) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', session!.user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const wsIds = (workspaceIds || []).filter(id => id && id !== 'unassigned');

      const { data, error } = await (supabase
        .from(FOLDERS)
        .insert({
          name,
          organization_id: profile.organization_id,
          parent_id: parentId || null,
          workspace_id: wsIds[0] || null,
          workspace_ids: wsIds,
        } as never)
        .select()
        .single() as unknown as Promise<{ data: any; error: any }>);

      if (error) throw error;
      return data as ScheduledMessageFolder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-message-folders'] });
      toast({ title: 'Pasta criada' });
    },
    onError: (error: any) => notifyError(error, 'Erro ao criar pasta'),
  });
}

export function useUpdateScheduledMessageFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      folderId,
      name,
      workspaceIds,
    }: {
      folderId: string;
      name?: string;
      workspaceIds?: string[] | null;
    }) => {
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (workspaceIds !== undefined) {
        const wsIds = (workspaceIds || []).filter(id => id && id !== 'unassigned');
        updateData.workspace_ids = wsIds;
        updateData.workspace_id = wsIds[0] || null;
      }

      const { data, error } = await (supabase
        .from(FOLDERS)
        .update(updateData as never)
        .eq('id', folderId)
        .select('id') as unknown as Promise<{ data: any[] | null; error: any }>);

      if (error) throw error;
      // RLS não gera erro em update de 0 linhas — sem isto o toast seria verde
      // e nada teria mudado.
      if (!data || data.length === 0) throw new Error('Sem permissão para alterar esta pasta.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-message-folders'] });
      toast({ title: 'Pasta atualizada' });
    },
    onError: (error: any) => notifyError(error, 'Erro ao atualizar pasta'),
  });
}

export function useDeleteScheduledMessageFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folderId: string) => {
      const { data, error } = await (supabase
        .from(FOLDERS)
        .delete()
        .eq('id', folderId)
        .select('id') as unknown as Promise<{ data: any[] | null; error: any }>);

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Sem permissão para excluir esta pasta.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-message-folders'] });
      // As programações que estavam dentro voltam para a raiz (ON DELETE SET NULL).
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] });
      toast({
        title: 'Pasta excluída',
        description: 'As programações que estavam nela voltaram para a raiz.',
      });
    },
    onError: (error: any) => notifyError(error, 'Erro ao excluir pasta'),
  });
}

export function useMoveScheduledMessageToFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, folderId }: { messageId: string; folderId: string | null }) => {
      // Só o folder_id muda. O workspace da programação NÃO é herdado da pasta:
      // ele decide por qual número o disparo sai, e trocá-lo em silêncio pode
      // deixar a programação num workspace sem número conectado.
      const { data, error } = await supabase
        .from('scheduled_messages')
        .update({ folder_id: folderId } as any)
        .eq('id', messageId)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Sem permissão para mover esta programação.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] });
      toast({ title: 'Programação movida' });
    },
    onError: (error: any) => notifyError(error, 'Erro ao mover programação'),
  });
}
