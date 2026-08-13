import { ExternalLink, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Mostra como a DM da automação chega para quem comentou.
 *
 * A perspectiva é deliberadamente a DE QUEM RECEBE, não a da empresa: o balão
 * fica à esquerda, com o avatar da conta conectada. Quem monta a automação
 * precisa enxergar o que o cliente dele vai ver, e essa inversão é justamente o
 * que se perde ao escrever a mensagem num Textarea solto.
 *
 * As variáveis ({{username}}) são substituídas por um exemplo — texto cru com
 * chaves no meio não deixa avaliar se a mensagem ficou boa.
 */

interface InstagramDmPreviewProps {
  text: string;
  accountUsername?: string | null;
  accountAvatarUrl?: string | null;
  /** Botão de link (template genérico). Ignorado quando há quick reply. */
  button?: { label: string; url: string } | null;
  /** Chip de resposta rápida. Tem precedência sobre o botão — a API não permite os dois juntos. */
  quickReply?: { label: string } | null;
  /** Texto do follow-up, mostrado como segunda mensagem quando configurado. */
  followupText?: string | null;
  className?: string;
}

/** Nome de exemplo para as variáveis. Sem isto o preview mostraria "Oi {{username}}!". */
const SAMPLE_VARS: Record<string, string> = {
  username: 'ana.souza',
};

function interpolate(template: string): string {
  return String(template || '').replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (match, key) => SAMPLE_VARS[key] ?? match,
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-sm text-foreground">
      {children}
    </div>
  );
}

export function InstagramDmPreview({
  text,
  accountUsername,
  accountAvatarUrl,
  button,
  quickReply,
  followupText,
  className,
}: InstagramDmPreviewProps) {
  const body = interpolate(text).trim();
  const followupBody = interpolate(followupText || '').trim();
  // A API do Instagram não aceita quick_replies junto com o template de botão:
  // quando os dois estão configurados, quem vai ao ar é o quick reply.
  const showQuickReply = !!quickReply?.label;
  const showButton = !showQuickReply && !!button?.url;

  return (
    <div className={cn('rounded-xl border bg-card overflow-hidden', className)}>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {accountAvatarUrl ? (
          <img
            src={accountAvatarUrl}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600" />
        )}
        <span className="text-xs font-medium">
          {accountUsername ? `@${accountUsername}` : 'sua conta'}
        </span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
          Prévia
        </span>
      </div>

      <div className="space-y-2 p-3">
        {body ? (
          <Bubble>
            <p className="whitespace-pre-wrap break-words">{body}</p>
          </Bubble>
        ) : (
          <Bubble>
            <span className="text-muted-foreground">
              Escreva a mensagem para ver a prévia
            </span>
          </Bubble>
        )}

        {showButton && (
          <div className="max-w-[85%] overflow-hidden rounded-2xl rounded-bl-md border bg-background">
            <div className="border-t px-3 py-2 text-center text-sm font-medium text-[#0095f6]">
              <span className="inline-flex items-center gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                {button?.label || 'Ver mais'}
              </span>
            </div>
          </div>
        )}

        {showQuickReply && (
          <div className="flex flex-wrap justify-end gap-1.5 pt-0.5">
            <span className="rounded-full border border-[#0095f6] px-3 py-1 text-xs font-medium text-[#0095f6]">
              {quickReply?.label}
            </span>
          </div>
        )}

        {followupBody && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                depois da espera
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Bubble>
              <p className="whitespace-pre-wrap break-words">{followupBody}</p>
            </Bubble>
          </div>
        )}
      </div>

      {/* O ponto que mais gera dúvida no módulo: o que abre a janela de 24h.
          Dizer isso aqui, no momento em que a pessoa escolhe entre botão e
          quick reply, evita a automação que "não entrega o follow-up". */}
      <div className="flex gap-2 border-t bg-muted/40 px-3 py-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {showQuickReply ? (
            <>
              Ao tocar no botão de resposta, o contato responde de verdade — isso
              abre a janela de 24h e libera o link e o acompanhamento.
            </>
          ) : showButton ? (
            <>
              O clique no link abre o navegador, mas <strong>não</strong> conta
              como resposta: sem uma resposta do contato, o acompanhamento não
              será entregue.
            </>
          ) : (
            <>
              Só é possível enviar novas mensagens nas 24h seguintes a uma
              resposta do contato.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
