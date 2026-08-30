import { cn } from '@/lib/utils';
import { useContactPresence } from '@/hooks/useContactPresence';

/**
 * Bolinha de presenca ("online / digitando / gravando") de uma linha da lista.
 *
 * B12 (docs/REVISAO_ESCALA_LANCAMENTO.md): antes o dado vinha embutido na
 * consulta da lista (`contact_presence` no join), e para nao ficar velho cada
 * evento de presenca invalidava a lista inteira — ~40 refetches por minuto por
 * usuario, com 3 joins cada. Agora cada linha assina o PresenceStore, que ja
 * mantem UM canal por organizacao e so notifica os ouvintes daquele contato:
 * a mudanca de "digitando..." re-renderiza a bolinha, e nada mais.
 */
interface ContactPresenceDotProps {
  contactId?: string | null;
  className?: string;
  /** Paleta do card do pipeline (fundo escuro) em vez da lista de conversas. */
  variant?: 'list' | 'pipeline';
}

function presenceLabel(isOnline: boolean, isTyping: boolean, isRecording: boolean) {
  if (isTyping) return 'digitando';
  if (isRecording) return 'gravando audio';
  return isOnline ? 'online' : 'offline';
}

export function ContactPresenceDot({ contactId, className, variant = 'list' }: ContactPresenceDotProps) {
  const { isTyping, isRecording, isOnline } = useContactPresence(contactId ?? null);

  const colors = variant === 'pipeline'
    ? { typing: 'bg-blue-400 animate-pulse', recording: 'bg-red-400 animate-pulse', online: 'bg-green-400', offline: 'bg-zinc-500' }
    : { typing: 'bg-blue-500 animate-pulse', recording: 'bg-red-500 animate-pulse', online: 'bg-green-500', offline: 'bg-muted-foreground/40' };

  return (
    <span
      className={cn(
        'rounded-full',
        className,
        isTyping ? colors.typing : isRecording ? colors.recording : isOnline ? colors.online : colors.offline
      )}
      title={presenceLabel(isOnline, isTyping, isRecording)}
    />
  );
}
