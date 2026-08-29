import { forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Instagram, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * O vocabulário visual do Wizzy Engage.
 *
 * As seis telas do módulo nasceram uma de cada vez, e cada uma resolveu do seu
 * jeito as mesmas quatro coisas: o estado vazio, o chip de filtro, o indicador
 * de estado e o carregamento. O resultado era um módulo que parecia seis
 * produtos — três gramáticas diferentes para "esta conta está ligada" e dois
 * chips de filtro que discordavam na cor do texto ativo (um deles em magenta
 * de 12px, que não alcança 4.5:1 e some no fundo claro).
 *
 * Consistência aqui não é preciosismo: um botão que muda de forma entre duas
 * telas ensina o cliente a desconfiar da tela.
 */

/* ── Cor ──────────────────────────────────────────────────────────────── */

/**
 * As duas cores do módulo — e de onde elas vêm.
 *
 * O Engage nasceu monocromático por disciplina: cor só no ponto de estado,
 * nunca no texto. A disciplina estava certa e o resultado, errado. Sobre o
 * fundo escuro (7% de luz) e o cartão (10%), uma tela inteira de cinza sobre
 * cinza com dois selos coloridos não lê como sóbria, lê como apagada — e os
 * poucos acentos, sem nada em volta, parecem enfeite solto.
 *
 * A saída não é espalhar magenta. É dar à cor um TRABALHO, e o trabalho existe:
 * cada automação nasce em um lugar do Instagram. Comentário é a praça pública;
 * direct e story são a conversa. São duas famílias, e a galeria já as separa em
 * duas seções — a cor só torna visível uma divisão que o texto já faz.
 *
 * Os dois tons não são escolhidos, são herdados: comentário fica com o magenta
 * da marca, e mensagem com o violeta que JÁ está na tela, no degradê do balão
 * de saída do Direct (#a334e0 → #7b46f2). Os dois cabem dentro do degradê do
 * Instagram (âmbar → rosa → roxo) que marca a conta no topo. Nenhuma cor
 * estrangeira entra.
 *
 * Dosagem: a cor mora em superfície e borda, nunca em corpo de texto. Magenta
 * 340 82% 55% sobre cartão branco dá ~4.2:1 — reprova para 13px. Como tinta de
 * fundo a 10% e como fio de 1px, ela colore a tela sem nunca ser lida.
 */
export type EngageAccent = 'comment' | 'message';

export const ENGAGE_ACCENT: Record<
  EngageAccent,
  {
    /** Ladrilho do ícone que abre a seção. */
    tile: string;
    /** O fio da régua, que sai da cor e morre no cinza da borda. */
    rule: string;
    /** A luz no topo do cartão, atrás da prévia. */
    wash: string;
    /** Borda em repouso e no hover. */
    border: string;
  }
> = {
  comment: {
    tile: 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/20',
    rule: 'from-primary/50',
    wash: 'from-primary/[0.20] via-primary/[0.11] to-primary/[0.05]',
    border: 'border-primary/20 hover:border-primary/50',
  },
  message: {
    tile: 'bg-violet-500/10 text-violet-600 ring-1 ring-inset ring-violet-500/20 dark:text-violet-400',
    rule: 'from-violet-500/50',
    wash: 'from-violet-500/[0.22] via-violet-500/[0.12] to-violet-500/[0.06]',
    border: 'border-violet-500/20 hover:border-violet-500/50',
  },
};

/* ── Tipografia ───────────────────────────────────────────────────────── */

/**
 * A escala.
 *
 * O módulo inteiro vivia entre 12 e 20px: título de tela, nome de aba, rótulo
 * de coluna e legenda de rodapé no mesmo intervalo de oito pixels. Sem salto de
 * escala o olho não tem por onde entrar e a tela vira uma parede uniforme de
 * cinza — que é a sensação de "não está bonito" quando nada, isoladamente,
 * está errado.
 *
 * O tracking negativo aperta conforme o corpo cresce: -0.006em em 13px,
 * -0.024em em 34px. É a metade da receita que quase nunca é copiada e a que
 * mais rende — em corpo grande o espacejamento padrão do Inter deixa a palavra
 * frouxa, e frouxo lê como amador.
 *
 * O peso 300 vale só de 17px para cima. Abaixo disso o traço fino perde
 * contraste contra o fundo, e como `muted-foreground` já é cinza médio, um
 * subtítulo 300 em 13px sairia ilegível no tema escuro. A voz sussurrada é um
 * recurso de corpo grande, não um estilo de legenda.
 */

/** Título de tela. O único corpo grande do módulo — um por página. */
export function EngageDisplay({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cn('text-[34px] font-semibold leading-[1.12] tracking-[-0.024em]', className)}>
      {children}
    </h2>
  );
}

/** Título de bloco: painel, seção de formulário, cabeçalho de estado vazio. */
export function EngageTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={cn('text-[21px] font-semibold leading-[1.24] tracking-[-0.017em]', className)}>
      {children}
    </h3>
  );
}

/**
 * A linha que explica — 19px, peso 300.
 *
 * Um subtítulo em 14px cinza é uma nota de rodapé promovida a subtítulo: diz
 * "isto é secundário" no mesmo gesto em que pede para ser lido. Em 19px ele
 * assume o posto, e o peso 300 impede que ele compita com o título acima.
 */
export function EngageLede({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'max-w-[58ch] text-[19px] font-light leading-[1.5] tracking-[-0.011em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * A régua que abre uma seção: rótulo, fio até a margem, contagem.
 *
 * O fio hairline faz o trabalho que seria de um cartão em volta do grupo.
 * Separar com uma linha custa 1px; separar com um contêiner custa uma borda, um
 * fundo e um padding que empurra todo o conteúdo para dentro — e produz o
 * cartão dentro de cartão que este arquivo existe para evitar.
 *
 * Com `accent`, a régua passa a carregar a cor da família: o ícone num ladrilho
 * tingido e o fio saindo dessa cor até morrer no cinza da borda. É onde a cor
 * rende mais por pixel gasto — a régua já existia, já estava no lugar de
 * "aqui começa outra coisa", e só faltava dizer QUE outra coisa é.
 */
export function EngageSectionHeader({
  label,
  meta,
  accent,
  icon: Icon,
}: {
  label: string;
  meta?: React.ReactNode;
  accent?: EngageAccent;
  icon?: LucideIcon;
}) {
  const tone = accent ? ENGAGE_ACCENT[accent] : null;

  return (
    <div className="flex items-center gap-3">
      {tone && Icon && (
        <span
          className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', tone.tile)}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
      <h4 className="shrink-0 text-[13px] font-medium tracking-[-0.006em]">{label}</h4>
      <span
        className={cn(
          'h-px flex-1 bg-gradient-to-r to-border',
          tone ? tone.rule : 'from-border',
        )}
        aria-hidden
      />
      {meta && (
        <span className="shrink-0 text-[12px] tracking-[-0.02em] text-muted-foreground">{meta}</span>
      )}
    </div>
  );
}

/* ── Superfície ───────────────────────────────────────────────────────── */

/**
 * O painel padrão: uma borda, um fundo, sem cartão dentro de cartão.
 *
 * Substitui o `<Card><CardContent className="p-0">` que envolvia as tabelas —
 * o mesmo desenho, sem a indireção de dois componentes para produzir um
 * retângulo.
 */
export function EngagePanel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card', className)}>{children}</div>
  );
}

/** A faixa no topo de uma aba: resumo à esquerda, ação à direita. */
export function EngageToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      {children}
    </div>
  );
}

/* ── Estados vazios ───────────────────────────────────────────────────── */

/**
 * O vazio que ensina.
 *
 * Um retângulo tracejado com "nada aqui" em cinza informa o que a pessoa já
 * sabe. O que falta é a próxima ação — por isso `action` faz parte da
 * assinatura, e não é opcional por acidente.
 *
 * O tracejado saiu junto: a borda pontilhada é uma segunda voz dizendo "isto
 * está incompleto" logo abaixo de um título que já diz. Fio contínuo e uma
 * troca de superfície bastam para o bloco recuar sem gaguejar.
 */
export function EngageEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-muted/30 px-6 py-16 text-center">
      {/* O ícone tingido é o único ponto de cor do bloco: um vazio inteiramente
          cinza dentro de uma tela cinza não se distingue de um erro de
          carregamento. A tinta a 10% custa nada em legibilidade e devolve ao
          bloco a aparência de coisa desenhada. */}
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-5 text-[21px] font-semibold leading-[1.24] tracking-[-0.017em]">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-[52ch] text-[15px] leading-relaxed tracking-[-0.011em] text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * O bloqueio por conta desconectada — a tela que todo cliente novo vê primeiro.
 *
 * Antes eram quatro variações do mesmo cartão tracejado, cada uma mandando a
 * pessoa "ir em Configurações" sem levá-la lá: um beco sem saída com instrução
 * de mapa. Agora é um convite com o botão que resolve.
 *
 * O quadrado com o degradê do Instagram representa o Instagram — é a única cor
 * de terceiro na tela, e está no lugar onde ela significa alguma coisa.
 */
export function EngageNotConnected({ purpose }: { purpose: string }) {
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border bg-card p-6 sm:p-8">
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-white">
          <Instagram className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[21px] font-semibold leading-[1.24] tracking-[-0.017em]">
            Conecte uma conta do Instagram
          </p>
          <p className="mt-1.5 max-w-[62ch] text-[15px] leading-relaxed tracking-[-0.011em] text-muted-foreground">
            {purpose} Precisa ser um perfil profissional — Comercial ou Criador de
            conteúdo — ligado a uma Página do Facebook.
          </p>
        </div>
        <Button onClick={() => navigate('/settings?tab=instagram')} className="gap-2 sm:shrink-0">
          <Instagram className="h-4 w-4" aria-hidden />
          Conectar
        </Button>
      </div>
    </div>
  );
}

/* ── Filtros ──────────────────────────────────────────────────────────── */

/**
 * Chip de filtro.
 *
 * O estado ativo vem da borda e do fundo, nunca da cor do texto: o magenta da
 * marca em 12px fica em ~3.9:1 sobre superfície clara, abaixo do mínimo de
 * leitura. Um filtro que não se lê não é um filtro.
 */
export function EngageFilterChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] tracking-[-0.006em]',
        'transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        active
          ? 'border-primary bg-primary/10 font-medium text-foreground'
          : 'border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cn('tabular-nums', active ? 'text-foreground/60' : 'text-muted-foreground/60')}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ── Estado ───────────────────────────────────────────────────────────── */

export type EngageTone = 'live' | 'ok' | 'warn' | 'error' | 'idle';

const TONE_DOT: Record<EngageTone, string> = {
  live: 'bg-primary animate-pulse motion-reduce:animate-none',
  ok: 'bg-status-open',
  warn: 'bg-status-pending',
  error: 'bg-destructive',
  idle: 'bg-muted-foreground/40',
};

/**
 * O ponto que carrega o estado.
 *
 * Cor no ponto e texto neutro ao lado, nunca texto colorido: verde e âmbar
 * sobre superfície clara não passam de 4.5:1 em corpo pequeno. Colorir a
 * palavra "conectado" custaria a legibilidade da palavra "conectado".
 */
export function EngageDot({ tone, className }: { tone: EngageTone; className?: string }) {
  return (
    <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[tone], className)} />
  );
}

/**
 * Encaminha a ref e repassa os props porque este componente é usado dentro de
 * `<TooltipTrigger asChild>`: o Radix precisa pendurar os handlers e medir o
 * elemento real, e um componente que engole os dois faz o tooltip nunca abrir.
 */
export const EngageStatus = forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { tone: EngageTone }
>(({ tone, children, className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      'inline-flex items-center gap-1.5 whitespace-nowrap text-[15px] tracking-[-0.011em]',
      tone === 'idle' && 'text-muted-foreground',
      className,
    )}
    {...props}
  >
    <EngageDot tone={tone} />
    {children}
  </span>
));
EngageStatus.displayName = 'EngageStatus';

/* ── Carregamento ─────────────────────────────────────────────────────── */

/**
 * Esqueleto no lugar do relógio de areia.
 *
 * Um spinner centralizado num vazio diz "espere" e nada mais, e a página salta
 * quando o conteúdo chega. O esqueleto já mostra a forma do que vem — a tela
 * nasce com a altura que vai ter.
 */
export function EngageTableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <EngagePanel>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, column) => (
              <Skeleton
                key={column}
                className={cn(
                  'h-4',
                  column === 0 ? 'w-40 shrink-0' : 'flex-1',
                  column > 2 && 'hidden sm:block',
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </EngagePanel>
  );
}

export function EngageListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <EngagePanel>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex items-center gap-3 p-4">
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </EngagePanel>
  );
}
