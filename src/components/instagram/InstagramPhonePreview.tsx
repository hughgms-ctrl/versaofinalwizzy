import { Bookmark, ChevronLeft, Heart, ImageIcon, Info, MessageCircle, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InstagramMediaItem } from '@/hooks/useInstagramMedia';
import type { GuidedState } from './templates/instagramTemplates';

/**
 * A automação inteira desenhada como ela chega no celular de quem interage.
 *
 * Duas telas, porque a automação tem dois lados que não cabem na mesma imagem:
 * a publicação onde ela é acionada e a conversa que ela produz. O ManyChat faz
 * a mesma separação — e a razão é a mesma: quem escreve a mensagem precisa ver
 * a sequência COMPLETA (primeira DM → resposta da pessoa → link → lembrete),
 * porque é a sequência, não cada texto isolado, que decide se a automação
 * funciona.
 *
 * A perspectiva é sempre a de QUEM RECEBE: as mensagens da empresa ficam à
 * esquerda, as da pessoa à direita. É a inversão que se perde ao escrever num
 * campo de texto solto.
 *
 * O aparelho é escuro nos dois temas de propósito: ele representa o aplicativo
 * do Instagram, não a interface da Wizzy. Um telefone que muda de cor junto com
 * o painel pareceria parte do formulário.
 */

export type PhonePreviewMode = 'post' | 'dm';

interface InstagramPhonePreviewProps {
  mode: PhonePreviewMode;
  guided: GuidedState;
  accountUsername?: string | null;
  accountAvatarUrl?: string | null;
  /** Post escolhido, quando o escopo é por publicação. */
  media?: InstagramMediaItem | null;
  className?: string;
}

const SAMPLE_USERNAME = 'ana.souza';
const SAMPLE_EMAIL = 'ana.souza@email.com';

function interpolate(template: string): string {
  return String(template || '').replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (match, key) => (key === 'username' ? SAMPLE_USERNAME : match),
  );
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-5 pb-1 pt-2.5 text-[11px] font-medium text-white">
      <span>9:01</span>
      <div className="flex items-center gap-1">
        <span className="flex items-end gap-[2px]" aria-hidden>
          <span className="h-1 w-[3px] rounded-sm bg-white/60" />
          <span className="h-1.5 w-[3px] rounded-sm bg-white/80" />
          <span className="h-2 w-[3px] rounded-sm bg-white" />
          <span className="h-2.5 w-[3px] rounded-sm bg-white" />
        </span>
        <span className="ml-1 h-2.5 w-5 rounded-[3px] border border-white/70 p-[1px]" aria-hidden>
          <span className="block h-full w-3/4 rounded-[1px] bg-white" />
        </span>
      </div>
    </div>
  );
}

/** Balão da empresa (esquerda) ou da pessoa (direita). */
function Bubble({ from, children }: { from: 'business' | 'person'; children: React.ReactNode }) {
  return (
    <div className={cn('flex', from === 'person' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[13px] leading-snug',
          from === 'person'
            ? 'rounded-br-md bg-[#3797f0] text-white'
            : 'rounded-bl-md bg-[#262626] text-white',
        )}
      >
        {children}
      </div>
    </div>
  );
}

function StepDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-white/10" />
      <span className="text-[9px] uppercase tracking-wide text-white/40">{label}</span>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

function PostScreen({
  guided,
  accountUsername,
  accountAvatarUrl,
  media,
}: Pick<InstagramPhonePreviewProps, 'guided' | 'accountUsername' | 'accountAvatarUrl' | 'media'>) {
  const handle = accountUsername || 'sua_conta';
  const firstKeyword = guided.keywords.split(',').map((k) => k.trim()).filter(Boolean)[0];
  // Sem palavra-chave definida, o comentário de exemplo precisa de alguma coisa
  // plausível — e no modo "qualquer palavra" é justamente o ponto que qualquer
  // texto serve.
  const commentText = guided.keywordMode === 'any'
    ? 'que legal isso!'
    : firstKeyword || 'quero';

  return (
    <>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-white">
        <ChevronLeft className="h-4 w-4 text-white/70" />
        <div className="flex-1 text-center">
          <p className="text-[9px] uppercase tracking-wider text-white/50">{handle}</p>
          <p className="text-[12px] font-semibold">Publicação</p>
        </div>
        <span className="w-4" />
      </div>

      <div className="flex items-center gap-2 px-3 py-2">
        <Avatar url={accountAvatarUrl} size="sm" />
        <span className="text-[12px] font-semibold text-white">{handle}</span>
      </div>

      <div className="aspect-square w-full bg-[#111]">
        {media?.thumbnailUrl ? (
          <img
            src={media.thumbnailUrl}
            alt={media.caption?.slice(0, 60) || 'Publicação'}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/30">
            <ImageIcon className="h-8 w-8" />
            <p className="px-6 text-center text-[11px] leading-relaxed">
              {guided.postScope === 'next_post'
                ? 'Vale na próxima publicação ou Reel que você postar'
                : guided.postScope === 'all_posts'
                  ? 'Vale em qualquer publicação ou Reel'
                  : 'Escolha uma publicação ao lado'}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 px-3 py-2 text-white">
        <span className="flex items-center gap-1 text-[12px]">
          <Heart className="h-4 w-4" /> 128
        </span>
        <span className="flex items-center gap-1 text-[12px]">
          <MessageCircle className="h-4 w-4" /> 14
        </span>
        <Send className="h-4 w-4" />
        <Bookmark className="ml-auto h-4 w-4" />
      </div>

      {media?.caption && (
        <p className="line-clamp-3 px-3 pb-2 text-[11px] leading-relaxed text-white/70">
          <span className="font-semibold text-white">{handle} </span>
          {media.caption}
        </p>
      )}

      {/* O comentário de exemplo é o que torna a regra concreta: mostra qual
          texto, escrito por outra pessoa, faz a automação disparar. */}
      <div className="border-t border-white/10 px-3 py-2.5">
        <p className="mb-2 text-[9px] uppercase tracking-wider text-white/40">
          Comentário que dispara
        </p>
        <div className="flex items-start gap-2">
          <div className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600" />
          <p className="text-[12px] leading-snug text-white">
            <span className="font-semibold">{SAMPLE_USERNAME} </span>
            <span className="rounded bg-[#3797f0]/25 px-1 text-white">{commentText}</span>
          </p>
        </div>
      </div>
    </>
  );
}

function DmScreen({
  guided,
  accountUsername,
  accountAvatarUrl,
}: Pick<InstagramPhonePreviewProps, 'guided' | 'accountUsername' | 'accountAvatarUrl'>) {
  const handle = accountUsername || 'sua_conta';
  const opening = interpolate(guided.openingText).trim();
  const hasLink = guided.linkEnabled && !!guided.linkUrl.trim();
  const asksEmail = guided.openingMode === 'ask_email';
  // Chip e pergunta de e-mail são caminhos alternativos para a mesma coisa —
  // fazer a pessoa responder. Só um dos dois vai ao ar (ver guidedToPayload).
  const showChip = !asksEmail && hasLink;

  return (
    <>
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <ChevronLeft className="h-4 w-4 text-white/70" />
        <Avatar url={accountAvatarUrl} size="sm" />
        <span className="text-[12px] font-semibold text-white">{handle}</span>
      </div>

      <div className="space-y-2 p-3">
        <Bubble from="business">
          {opening || <span className="text-white/40">Escreva a primeira mensagem</span>}
        </Bubble>

        {showChip && (
          <div className="flex justify-end">
            <span className="rounded-full border border-[#3797f0] px-3 py-1 text-[11px] font-medium text-[#3797f0]">
              {guided.openingButtonLabel || 'Me envie o link'}
            </span>
          </div>
        )}

        {(showChip || asksEmail) && (
          <>
            <StepDivider label="a pessoa responde" />
            <Bubble from="person">
              {asksEmail ? SAMPLE_EMAIL : (guided.openingButtonLabel || 'Me envie o link')}
            </Bubble>
          </>
        )}

        {hasLink && (
          <>
            <Bubble from="business">
              {interpolate(guided.linkMessage).trim() || 'Aqui está o link:'}
            </Bubble>
            <div className="flex justify-start">
              <div className="w-[80%] overflow-hidden rounded-2xl rounded-bl-md bg-[#262626]">
                <div className="border-t border-white/10 px-3 py-2 text-center text-[12px] font-semibold text-[#3797f0]">
                  {guided.linkLabel || 'Acessar'}
                </div>
              </div>
            </div>
          </>
        )}

        {guided.reminderEnabled && (
          <>
            <StepDivider
              label={`${guided.reminderWaitValue || '0'} ${
                guided.reminderWaitUnit === 'minutes' ? 'min'
                  : guided.reminderWaitUnit === 'hours' ? 'horas' : 'dias'
              } depois, se não acessou`}
            />
            <Bubble from="business">
              {interpolate(guided.reminderText).trim() || 'Mensagem de lembrete'}
            </Bubble>
          </>
        )}
      </div>
    </>
  );
}

function Avatar({ url, size }: { url?: string | null; size: 'sm' }) {
  const cls = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  return url ? (
    <img src={url} alt="" className={cn(cls, 'rounded-full object-cover')} />
  ) : (
    <div className={cn(cls, 'rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600')} />
  );
}

export function InstagramPhonePreview({
  mode,
  guided,
  accountUsername,
  accountAvatarUrl,
  media,
  className,
}: InstagramPhonePreviewProps) {
  const asksEmail = guided.openingMode === 'ask_email';
  const opensWindow = asksEmail || (guided.linkEnabled && !!guided.linkUrl.trim());

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div className="w-full max-w-[300px] overflow-hidden rounded-[2rem] border-[6px] border-[#1c1c1e] bg-black shadow-xl">
        <StatusBar />
        <div className="max-h-[520px] overflow-y-auto">
          {mode === 'post' ? (
            <PostScreen
              guided={guided}
              accountUsername={accountUsername}
              accountAvatarUrl={accountAvatarUrl}
              media={media}
            />
          ) : (
            <DmScreen
              guided={guided}
              accountUsername={accountUsername}
              accountAvatarUrl={accountAvatarUrl}
            />
          )}
        </div>
      </div>

      {/* O ponto que mais gera automação quebrada no módulo: o que abre a janela
          de 24h. Dito aqui, ao lado da sequência desenhada, no momento em que a
          pessoa escolhe entre pedir uma resposta e mandar o link direto. */}
      {mode === 'dm' && (
        <div className="flex w-full max-w-[300px] gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {opensWindow ? (
              <>
                A resposta da pessoa abre a janela de 24h do Instagram — é ela que
                libera o link e o lembrete. Sem resposta, nada além da primeira
                mensagem é entregue.
              </>
            ) : (
              <>
                Sem pedir uma resposta, só a primeira mensagem é entregue: o
                Instagram mantém a conversa fechada até a pessoa escrever.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
