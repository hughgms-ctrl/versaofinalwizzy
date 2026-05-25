import type { DbConversation } from '@/hooks/useConversations';

export type DerivedStatus = 'aberto' | 'em_andamento' | 'encerrada' | 'archived';

export interface DerivedStatusInfo {
  status: DerivedStatus;
  label: string;
  className: string;
}

/**
 * Calcula o status real da conversa.
 *
 * Ordem de prioridade:
 *  1. archived  → status='archived' (decisão manual de arquivar — não reabre)
 *  2. encerrada → status='closed' OU closed_at preenchido (atendimento finalizado;
 *                 reabre automaticamente se o cliente mandar nova mensagem via trigger no banco)
 *  3. aberto    → última mensagem é do contato (inbound) e ainda não foi respondida
 *  4. em_andamento → já houve resposta nossa (humano ou IA), ou ainda não há mensagens
 *
 * Os legados 'pending' e 'resolved' são tratados como conversa ativa e seguem
 * a regra derivada da última mensagem.
 */
export function getDerivedStatus(
  conversation: Pick<DbConversation, 'status' | 'last_message'> & { closed_at?: string | null }
): DerivedStatus {
  if (conversation.status === 'archived') return 'archived';
  if (conversation.status === 'closed' || conversation.closed_at) return 'encerrada';
  const lastMessage = conversation.last_message?.[0];
  // Sem mensagens ainda → trata como "em andamento" (conversa criada por nós)
  if (!lastMessage) return 'em_andamento';
  return lastMessage.direction === 'inbound' ? 'aberto' : 'em_andamento';
}

export function getDerivedStatusInfo(
  conversation: Pick<DbConversation, 'status' | 'last_message'> & { closed_at?: string | null }
): DerivedStatusInfo {
  const status = getDerivedStatus(conversation);
  switch (status) {
    case 'aberto':
      return {
        status,
        label: 'Aberto',
        className: 'bg-red-500/10 text-red-600 dark:text-red-400',
      };
    case 'em_andamento':
      return {
        status,
        label: 'Em andamento',
        className: 'bg-green-500/10 text-green-600 dark:text-green-400',
      };
    case 'encerrada':
      return {
        status,
        label: 'Encerrada',
        className: 'bg-muted-foreground/10 text-muted-foreground',
      };
    case 'archived':
      return {
        status,
        label: 'Arquivado',
        className: 'bg-muted text-muted-foreground',
      };
  }
}
