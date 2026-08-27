import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateConversation } from '@/hooks/useConversations';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { toast } from '@/hooks/use-toast';

export interface StartConversationContact {
  id: string;
  name?: string | null;
  workspace_id?: string | null;
}

/**
 * Atalho "Iniciar conversa": abre o chat com um contato que já existe na
 * agenda, criando a conversa se ainda não houver uma. Reaproveita
 * useCreateConversation (que já é idempotente e respeita "workspace = número"),
 * mas passando o id do contato — pelo telefone o número seria re-normalizado.
 */
export function useStartConversation() {
  const navigate = useNavigate();
  const createConversation = useCreateConversation();
  const { selectedWorkspaceId } = useWorkspaceContext();

  const startConversation = useCallback(
    async (contact: StartConversationContact) => {
      // 'unassigned' é sentinela da UI ("Sem Workspace"), não um uuid.
      const activeWorkspaceId =
        selectedWorkspaceId && selectedWorkspaceId !== 'unassigned' ? selectedWorkspaceId : null;
      // Sem workspace selecionado, a conversa nasce no workspace do contato —
      // é ele que decide por qual número o envio sai.
      const workspaceId = activeWorkspaceId || contact.workspace_id || null;

      try {
        const result = await createConversation.mutateAsync({
          contactId: contact.id,
          workspaceId,
        });

        const conversationId = result?.conversation?.id;
        if (!conversationId) throw new Error('Conversa criada sem id');

        navigate(`/conversations?id=${conversationId}`);
      } catch (error) {
        toast({
          title: 'Erro ao iniciar conversa',
          description:
            error instanceof Error ? error.message : 'Não foi possível abrir a conversa com este contato.',
          variant: 'destructive',
        });
      }
    },
    [createConversation, navigate, selectedWorkspaceId],
  );

  return { startConversation, isStarting: createConversation.isPending };
}
