import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  EngageDisplay,
  EngageLede,
  EngageSectionHeader,
} from '@/components/instagram/EngageUI';
import {
  BLANK_TEMPLATE,
  INSTAGRAM_TEMPLATES,
  TEMPLATE_GROUPS,
  templatePreview,
  type InstagramTemplate,
} from './instagramTemplates';

/**
 * A porta de entrada do Wizzy Engage.
 *
 * Antes, quem abria o módulo via uma lista vazia e um botão "Nova automação" —
 * e precisava saber de antemão o que queria montar. A tela em branco é o que
 * faz o cliente novo fechar a aba: automação é um assunto em que ninguém sabe o
 * que é possível até ver um exemplo.
 *
 * DESENHO: cada cartão mostra a CONVERSA que o modelo produz.
 *
 * A primeira versão usava um emoji por cartão. Emoji decora e não informa — um
 * envelope e um balão de fala não distinguem "manda o link" de "pede o
 * e-mail" —, e sete deles em sequência viram ruído. Trocar por ícones
 * resolveria o tom e manteria o problema: sete cartões idênticos, com o mesmo
 * peso, não dão ao olho por onde começar.
 *
 * A prévia resolve os dois. É conteúdo de verdade (a primeira mensagem e a
 * forma como a pessoa responde), diferente em cada modelo, e é exatamente o que
 * se quer saber antes de escolher. Dá vida ao cartão sendo útil, e não
 * enfeitando-o.
 *
 * As cores dos balões são as do Direct, de propósito: aquele retângulo
 * representa o aplicativo, não a interface da Wizzy. Um balão magenta pareceria
 * parte do formulário. O balão de saída usa o degradê roxo do Direct, o mesmo
 * de InstagramPhonePreview — a mesma mensagem desenhada em dois lugares não
 * pode ter duas cores, ou o módulo mostra dois Instagrams diferentes.
 *
 * E se aquele retângulo representa o Instagram, ele usa as cores do Instagram
 * inteiras — fundo branco ou preto, balão #efefef ou #262626 —, não os tokens
 * da Wizzy. Tentar desenhá-lo com `bg-card` sobre `bg-background` produzia, no
 * tema escuro, 10% de luz sobre 7%: uma diferença que existe no código e não
 * existe no olho. A conversa desaparecia dentro do próprio cartão, e a tela
 * inteira virava preto sobre preto.
 *
 * O ganho não é só de contraste. Uma tela de Instagram dentro de um cartão da
 * Wizzy lê como captura de tela — a pessoa reconhece o que está vendo antes de
 * ler o título, que é exatamente o trabalho que se espera de uma prévia.
 *
 * A prévia ocupa o topo inteiro e tem altura mínima fixa. As duas coisas andam
 * juntas: sendo ela o conteúdo que decide a escolha, ganha a área; tendo altura
 * fixa, os títulos de uma fileira de cartões caem todos na mesma linha, e a
 * grade lê como grade em vez de dente de serra.
 *
 * SUPERFÍCIE: poço, não elevação. A prévia usa `bg-background` e o balão de
 * entrada usa `bg-card` — a mesma relação que a página tem com os cartões, uma
 * escala para dentro. A primeira versão fazia o contrário (`bg-muted/50` no
 * fundo, `bg-card` no balão) e no tema escuro isso punha o balão em 10% de luz
 * sobre um fundo de 12%: preto sobre preto, o balão desaparecendo dentro da
 * própria conversa. Poço funciona nos dois temas porque `background` é mais
 * escuro que `card` no claro e no escuro — a relação não depende do tema.
 *
 * COR: o avatar é o degradê do Instagram, o mesmo que marca a conta na faixa
 * do topo e na tela de conexão. É a única cor que entra sem ser pedida, e ela
 * entra porque tem trabalho a fazer: dá vida ao cartão que não tem resposta da
 * pessoa — sem ele, um modelo de "conversa fica aberta para o time" é um
 * retângulo cinza com uma frase cinza dentro.
 */

interface InstagramTemplateGalleryProps {
  connectedAccounts: number;
  /** A conta que aparece no topo de cada prévia. Ausente antes de conectar. */
  account?: GalleryAccount;
  onPick: (template: InstagramTemplate) => void;
  onOpenFlows: () => void;
}

/** Quem a pessoa vê do outro lado da conversa: a conta conectada. */
export interface GalleryAccount {
  username?: string | null;
  avatarUrl?: string | null;
}

/**
 * O topo do thread — foto e @ de quem está falando.
 *
 * É o que transforma dois balões soltos em uma conversa. Sem ele o retângulo é
 * uma ilustração de mensagem; com ele é a tela que o lead vai ver, e a foto
 * real da conta é o que faz o cliente reconhecer a si mesmo ali.
 *
 * A foto é a da conta conectada, e não de um contato fictício, porque a prévia
 * é desenhada do ponto de vista de QUEM RECEBE: os balões cinza à esquerda são
 * a automação falando, o azul à direita é a pessoa respondendo. Do lado de lá,
 * o thread se chama pelo nome do negócio.
 */
function ThreadHeader({ account }: { account?: GalleryAccount }) {
  return (
    <div className="flex items-center gap-2 border-b border-black/[0.07] px-4 py-2.5 dark:border-white/10">
      {account?.avatarUrl ? (
        <img src={account.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
      ) : (
        <span
          className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600"
          aria-hidden
        />
      )}
      <span className="truncate text-[12px] font-semibold tracking-[-0.01em] text-[#262626] dark:text-white">
        {account?.username ? `@${account.username}` : 'seu perfil'}
      </span>
    </div>
  );
}

/** A conversa em miniatura, no topo do cartão. */
function ConversationPreview({
  template,
  account,
}: {
  template: InstagramTemplate;
  account?: GalleryAccount;
}) {
  const { message, reply } = templatePreview(template);

  return (
    <div className="border-b bg-white dark:bg-black">
      <ThreadHeader account={account} />

      <div className="flex min-h-[128px] flex-col justify-center gap-2 px-4 py-5">
        <div className="flex">
          <p className="max-w-[86%] rounded-[18px] rounded-bl-[6px] bg-[#efefef] px-3.5 py-2.5 text-[13px] leading-relaxed tracking-[-0.006em] text-[#111] dark:bg-[#262626] dark:text-white">
            {message}
          </p>
        </div>

        {reply?.kind === 'text' && (
          <div className="flex justify-end">
            <p className="max-w-[78%] rounded-[18px] rounded-br-[6px] bg-gradient-to-br from-[#a334e0] to-[#7b46f2] px-3.5 py-2 text-[13px] leading-relaxed tracking-[-0.006em] text-white">
              {reply.label}
            </p>
          </div>
        )}

        {reply?.kind === 'chip' && (
          <div className="flex justify-end">
            <span className="rounded-full border border-[#3797f0] bg-[#3797f0]/10 px-3 py-1.5 text-[12px] font-semibold tracking-[-0.01em] text-[#0074cc] dark:text-[#5ab0f7]">
              {reply.label}
            </span>
          </div>
        )}

        {/* Sem resposta da pessoa não há janela de 24h aberta, e a conversa
            termina na primeira mensagem. O espaço vazio seria uma mentira
            silenciosa sobre o alcance do modelo. */}
        {!reply && (
          <p className="text-[12px] tracking-[-0.02em] text-[#8e8e8e]">
            conversa fica aberta para o time
          </p>
        )}
      </div>
    </div>
  );
}

/** Os três passos, separados por seta. */
function Mechanism({ steps }: { steps: readonly string[] }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] tracking-[-0.02em] text-muted-foreground">
      {steps.map((step, index) => (
        <span key={step} className="inline-flex items-center gap-1.5">
          {index > 0 && <ArrowRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden />}
          {step}
        </span>
      ))}
    </p>
  );
}

function TemplateCard({
  template,
  account,
  onPick,
}: {
  template: InstagramTemplate;
  account?: GalleryAccount;
  onPick: (t: InstagramTemplate) => void;
}) {
  const featured = !!template.badge;

  return (
    <button
      type="button"
      onClick={() => onPick(template)}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border bg-card text-left',
        'transition-colors duration-200 ease-out hover:border-foreground/25',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'motion-reduce:transition-none',
        // O destaque vem da borda, não de fundo colorido: um cartão tingido
        // entre seis brancos vira propaganda, não hierarquia.
        featured && 'border-primary/40',
      )}
    >
      <ConversationPreview template={template} account={account} />

      {/* O hover mora no corpo, não na prévia: a prévia é a captura de tela, e
          uma captura que muda de cor ao passar o mouse deixa de ser captura. */}
      <div className="flex flex-1 flex-col gap-3 p-5 transition-colors duration-200 ease-out group-hover:bg-muted/40 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-[15px] font-medium leading-snug tracking-[-0.011em]">
            {template.title}
          </h4>
          {template.badge && (
            <Badge className="shrink-0 whitespace-nowrap font-normal">{template.badge}</Badge>
          )}
        </div>

        <p className="text-[14px] leading-relaxed tracking-[-0.009em] text-muted-foreground">
          {template.description}
        </p>

        <div className="mt-auto border-t pt-4">
          <Mechanism steps={template.steps} />
        </div>
      </div>
    </button>
  );
}

export function InstagramTemplateGallery({
  connectedAccounts,
  account,
  onPick,
  onOpenFlows,
}: InstagramTemplateGalleryProps) {
  const { profile } = useAuth();

  const firstName = (profile?.full_name || '').trim().split(/\s+/)[0];

  return (
    <div className="space-y-14">
      {/* O estado da conta e o total de contatos ficam na faixa acima das abas,
          onde valem para as seis telas. Repeti-los aqui seria dizer duas vezes
          a mesma coisa a 200px de distância. */}
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="space-y-2.5">
          <EngageDisplay>{firstName ? `Olá, ${firstName}` : 'Comece por aqui'}</EngageDisplay>
          <EngageLede>
            {connectedAccounts === 0
              ? 'Escolha um modelo para ver como ele funciona — conectar a conta fica para a hora de ativar.'
              : 'Cada modelo mostra a conversa que produz. Escolha um, ajuste o texto e ative.'}
          </EngageLede>
        </div>
        <button
          type="button"
          onClick={onOpenFlows}
          className="mt-3 inline-flex items-center gap-1 rounded-md text-[14px] tracking-[-0.009em] text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Prefiro montar um fluxo
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </header>

      {TEMPLATE_GROUPS.map((group) => {
        const items = INSTAGRAM_TEMPLATES.filter((t) => t.group === group.key);
        if (!items.length) return null;

        return (
          <section key={group.key} className="space-y-5">
            <EngageSectionHeader label={group.label} meta={`${items.length} modelos`} />

            {/* auto-fit em vez de breakpoints: os cartões se acomodam à largura
                real do conteúdo, que muda quando a barra lateral recolhe. */}
            <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
              {items.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  account={account}
                  onPick={onPick}
                />
              ))}
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-7">
        <div className="space-y-1">
          <p className="text-[17px] font-medium tracking-[-0.014em]">{BLANK_TEMPLATE.title}</p>
          <p className="text-[14px] leading-relaxed tracking-[-0.009em] text-muted-foreground">
            {BLANK_TEMPLATE.description}
          </p>
        </div>
        <Button variant="outline" onClick={() => onPick(BLANK_TEMPLATE)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Criar do zero
        </Button>
      </div>
    </div>
  );
}
