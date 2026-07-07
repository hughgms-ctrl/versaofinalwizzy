import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAddTagToContact, useRemoveTagFromContact } from '@/hooks/useTags';

async function runBatched<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency = 5
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index++];
      try {
        await fn(current);
        success++;
      } catch {
        failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return { success, failed };
}

function summarizeToast(title: string, success: number, failed: number) {
  toast({
    title,
    description: failed === 0
      ? `${success} contato(s) atualizado(s) com sucesso.`
      : `${success} com sucesso, ${failed} com erro.`,
    variant: failed > 0 && success === 0 ? 'destructive' : undefined,
  });
}

export function useBulkAddTag() {
  const queryClient = useQueryClient();
  const addTag = useAddTagToContact();

  return useMutation({
    mutationFn: async ({ contactIds, tagId }: { contactIds: string[]; tagId: string }) => {
      return runBatched(contactIds, (contactId) =>
        addTag.mutateAsync({ contactId, tagId, addedByType: 'manual' })
      );
    },
    onSuccess: ({ success, failed }) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      summarizeToast('Tag adicionada em massa', success, failed);
    },
  });
}

export function useBulkRemoveTag() {
  const queryClient = useQueryClient();
  const removeTag = useRemoveTagFromContact();

  return useMutation({
    mutationFn: async ({ contactIds, tagId }: { contactIds: string[]; tagId: string }) => {
      return runBatched(contactIds, (contactId) => removeTag.mutateAsync({ contactId, tagId }));
    },
    onSuccess: ({ success, failed }) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      summarizeToast('Tag removida em massa', success, failed);
    },
  });
}

export function useBulkMoveWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactIds, workspaceId }: { contactIds: string[]; workspaceId: string | null }) => {
      const { error } = await supabase.functions.invoke('safe-record-actions', {
        body: { type: 'set_contacts_workspace', contactIds, workspaceId },
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: 'Workspace atualizado',
        description: `${variables.contactIds.length} contato(s) movido(s) com sucesso.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao mover workspace',
        description: error.message || 'Não foi possível mover os contatos selecionados.',
        variant: 'destructive',
      });
    },
  });
}

export function useBulkDeleteContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contactIds: string[]) => {
      // Apaga conversas primeiro para não violar a foreign key, igual useDeleteContact.
      const { error: convError } = await supabase.from('conversations').delete().in('contact_id', contactIds);
      if (convError) console.error('Error deleting conversations:', convError);

      const { error } = await supabase.from('contacts').delete().in('id', contactIds);
      if (error) throw error;
    },
    onSuccess: (_, contactIds) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({
        title: 'Contatos removidos',
        description: `${contactIds.length} contato(s) removido(s) com sucesso.`,
      });
    },
    onError: () => {
      toast({
        title: 'Erro ao remover',
        description: 'Não foi possível remover os contatos selecionados.',
        variant: 'destructive',
      });
    },
  });
}

export function useBulkAddToCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactIds, campaignId }: { contactIds: string[]; campaignId: string }) => {
      const { data, error } = await supabase.functions.invoke('safe-record-actions', {
        body: { type: 'bulk_add_to_campaign', contactIds, campaignId },
      });
      if (error) throw error;
      return data as { triggered: number; queued: number; skipped: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast({
        title: 'Contatos adicionados à campanha',
        description: `${data.triggered} disparado(s) agora, ${data.queued} agendado(s)${data.skipped ? `, ${data.skipped} ignorado(s)` : ''}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao adicionar à campanha',
        description: error.message || 'Não foi possível adicionar os contatos selecionados.',
        variant: 'destructive',
      });
    },
  });
}
