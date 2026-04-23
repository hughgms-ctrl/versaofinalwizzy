import type { DbConversation } from '@/hooks/useConversations';

export type DerivedStatus = 'aberto' | 'em_andamento' | 'archived';

export interface DerivedStatusInfo {
  status: DerivedStatus;
  label: string;
  className: string;
}

/**
 * Calcula o status real da conversa com base na última mensagem.
 *
 * - archived: campo status = 'archived' (decisão manual de arquivar)
 * - aberto: última mensagem é do contato (inbound) e ainda não foi respondida
 * - em_andamento: já houve resposta (humano ou IA) após a última inbound
 *
 * Ignora os legados 'pending' e 'resolved' — tratam-se como conversa ativa
 * e seguem a regra derivada da última mensagem.
 */
export function getDerivedStatus(conversation: Pick<DbConversation, 'status' | 'last_message'>): DerivedStatus {
  if (conversation.status === 'archived') return 'archived';
  const lastMessage = conversation.last_message?.[0];
  // Sem mensagens ainda → trata como "em andamento" (conversa criada por nós)
  if (!lastMessage) return 'em_andamento';
  return lastMessage.direction === 'inbound' ? 'aberto' : 'em_andamento';
}

export function getDerivedStatusInfo(conversation: Pick<DbConversation, 'status' | 'last_message'>): DerivedStatusInfo {
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
    case 'archived':
      return {
        status,
        label: 'Arquivado',
        className: 'bg-muted text-muted-foreground',
      };
  }
}
