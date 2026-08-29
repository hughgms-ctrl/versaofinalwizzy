import {
  Bookmark,
  Camera,
  ChevronLeft,
  Circle,
  Film,
  Heart,
  Home,
  ImageIcon,
  Info,
  Menu,
  MessageCircle,
  Mic,
  Phone,
  Plus,
  Search,
  Send,
  Smile,
  Triangle,
  Video,
} from 'lucide-react';
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
 *
 * ALTURA FIXA. Um telefone não encolhe. A versão anterior usava `max-h` em
 * volta do conteúdo, então uma automação de uma mensagem só produzia um
 * aparelho de 130px de altura — o desenho deixava de ser um telefone e virava
 * uma caixa com um balão dentro, e a tela inteira dançava a cada tecla digitada
 * no formulário ao lado. Agora a moldura tem altura própria e é o conteúdo que
 * rola dentro dela, como acontece no aparelho de verdade.
 *
 * Pelo mesmo motivo a moldura tem tudo o que um celular tem à vista mesmo sem
 * ter função aqui: barra de status, campo de mensagem, botões de navegação do
 * sistema. São eles que fazem o olho reconhecer um telefone antes de ler
 * qualquer coisa — sem eles, sobra um retângulo preto.
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
    <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-2.5 text-[11px] font-medium text-white">
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

/**
 * Os botões do sistema, no rodapé do aparelho.
 *
 * Voltar, início e recentes — os três do Android. Não fazem nada e não deveriam:
 * estão aqui pelo mesmo motivo que a barra de status, para fechar a silhueta do
 * telefone. `aria-hidden` em todos, porque anunciar um botão inerte a quem usa
 * leitor de tela é pior do que não desenhá-lo.
 */
function SystemNavBar() {
  return (
    <div className="flex shrink-0 items-center justify-around px-8 pb-2 pt-2.5" aria-hidden>
      <Triangle className="h-3 w-3 -rotate-90 text-white/50" />
      <Circle className="h-3.5 w-3.5 text-white/50" />
      <Menu className="h-3.5 w-3.5 text-white/50" />
    </div>
  );
}

/** O campo de mensagem do Direct. Inerte, como o resto da moldura. */
function Composer() {
  return (
    <div className="flex shrink-0 items-center gap-2 px-2.5 pb-1 pt-1.5" aria-hidden>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#3797f0]">
        <Camera className="h-3.5 w-3.5 text-white" />
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full bg-[#262626] px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] text-white/40">Mensagem…</span>
        <Mic className="h-3.5 w-3.5 shrink-0 text-white/60" />
        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-white/60" />
        <Smile className="h-3.5 w-3.5 shrink-0 text-white/60" />
        <Plus className="h-3.5 w-3.5 shrink-0 text-white/60" />
      </div>
    </div>
  );
}

/** A barra de abas do feed, no rodapé da tela de publicação. */
function AppTabBar({ avatarUrl }: { avatarUrl?: string | null }) {
  return (
    <div className="flex shrink-0 items-center justify-around px-4 pb-1 pt-2" aria-hidden>
      <Home className="h-4 w-4 text-white" />
      <Search className="h-4 w-4 text-white/55" />
      <Film className="h-4 w-4 text-white/55" />
      <Heart className="h-4 w-4 text-white/55" />
      <Avatar url={avatarUrl} size="xs" />
    </div>
  );
}

/**
 * Balão da empresa (esquerda) ou da pessoa (direita).
 *
 * O balão de saída é o degradê roxo do Direct, não o azul que o componente
 * usava. O azul é a cor dos botões do Instagram; as mensagens que a pessoa
 * manda saem em roxo há várias versões, e a prévia só serve para conferir o
 * texto se ela for a mesma coisa que a pessoa vai ver.
 *
 * O avatar acompanha o balão da empresa porque no Direct ele acompanha: sem
 * ele, uma sequência de três mensagens da empresa parece três mensagens sem
 * remetente.
 */
function Bubble({
  from,
  avatarUrl,
  children,
}: {
  from: 'business' | 'person';
  avatarUrl?: string | null;
  children: React.ReactNode;
}) {
  if (from === 'person') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-gradient-to-br from-[#a334e0] to-[#7b46f2] px-3.5 py-2 text-[13px] leading-snug text-white">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1.5">
      <Avatar url={avatarUrl} size="xs" />
      <div className="max-w-[78%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-[#262626] px-3.5 py-2 text-[13px] leading-snug text-white">
        {children}
      </div>
    </div>
  );
}

/**
 * A anotação entre etapas, no formato em que o Direct separa mensagens por
 * data: texto centralizado e cinza, sem fio. Os dois fios que ladeavam o rótulo
 * eram desenho da Wizzy dentro de uma tela que finge não ser da Wizzy.
 */
function StepDivider({ label }: { label: string }) {
  return (
    <p className="px-2 py-1.5 text-center text-[10px] font-medium uppercase leading-relaxed tracking-wide text-white/35">
      {label}
    </p>
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2 text-white">
        <ChevronLeft className="h-4 w-4 text-white/70" aria-hidden />
        <div className="flex-1 text-center">
          <p className="truncate text-[9px] uppercase tracking-wider text-white/50">{handle}</p>
          <p className="text-[12px] font-semibold">Publicação</p>
        </div>
        <span className="w-4" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center gap-2 px-3 py-2">
          <Avatar url={accountAvatarUrl} size="sm" />
          <span className="truncate text-[12px] font-semibold text-white">{handle}</span>
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
              <ImageIcon className="h-8 w-8" aria-hidden />
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
            <Heart className="h-4 w-4" aria-hidden /> 128
          </span>
          <span className="flex items-center gap-1 text-[12px]">
            <MessageCircle className="h-4 w-4" aria-hidden /> 14
          </span>
          <Send className="h-4 w-4" aria-hidden />
          <Bookmark className="ml-auto h-4 w-4" aria-hidden />
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
            <div
              className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600"
              aria-hidden
            />
            <p className="text-[12px] leading-snug text-white">
              <span className="font-semibold">{SAMPLE_USERNAME} </span>
              <span className="rounded bg-[#3797f0]/25 px-1 text-white">{commentText}</span>
            </p>
          </div>
        </div>
      </div>

      <AppTabBar avatarUrl={accountAvatarUrl} />
    </div>
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
        <ChevronLeft className="h-4 w-4 shrink-0 text-white/70" aria-hidden />
        <Avatar url={accountAvatarUrl} size="sm" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">
          {handle}
        </span>
        <Phone className="h-3.5 w-3.5 shrink-0 text-white/70" aria-hidden />
        <Video className="h-3.5 w-3.5 shrink-0 text-white/70" aria-hidden />
      </div>

      {/* As mensagens começam coladas no rodapé, como numa conversa de verdade:
          `justify-end` com `mt-auto` empurra a sequência curta para baixo em vez
          de deixá-la boiando no meio de uma tela vazia. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col justify-end space-y-2 p-3">
          <Bubble from="business" avatarUrl={accountAvatarUrl}>
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
              <Bubble from="business" avatarUrl={accountAvatarUrl}>
                {interpolate(guided.linkMessage).trim() || 'Aqui está o link:'}
              </Bubble>
              <div className="flex justify-start pl-[26px]">
                <div className="w-[78%] overflow-hidden rounded-2xl rounded-bl-md bg-[#262626]">
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
              <Bubble from="business" avatarUrl={accountAvatarUrl}>
                {interpolate(guided.reminderText).trim() || 'Mensagem de lembrete'}
              </Bubble>
            </>
          )}
        </div>
      </div>

      <Composer />
    </div>
  );
}

function Avatar({ url, size }: { url?: string | null; size: 'xs' | 'sm' }) {
  const cls = size === 'xs' ? 'h-5 w-5' : 'h-6 w-6';
  return url ? (
    <img src={url} alt="" className={cn(cls, 'shrink-0 rounded-full object-cover')} />
  ) : (
    <div
      className={cn(cls, 'shrink-0 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600')}
      aria-hidden
    />
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
        {/* A altura é da moldura, não do conteúdo. */}
        <div className="flex h-[560px] flex-col">
          <StatusBar />
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
          <SystemNavBar />
        </div>
      </div>

      {/* O ponto que mais gera automação quebrada no módulo: o que abre a janela
          de 24h. Dito aqui, ao lado da sequência desenhada, no momento em que a
          pessoa escolhe entre pedir uma resposta e mandar o link direto. */}
      {mode === 'dm' && (
        <div className="flex w-full max-w-[300px] gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
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
