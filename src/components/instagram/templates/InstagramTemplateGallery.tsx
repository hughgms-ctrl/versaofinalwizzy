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
 * A cor azul dos balões é a do Instagram, de propósito: aquele retângulo
 * representa o aplicativo, não a interface da Wizzy. Um balão magenta pareceria
 * parte do formulário.
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
  onPick: (template: InstagramTemplate) => void;
  onOpenFlows: () => void;
}

/** A conversa em miniatura, no topo do cartão. */
function ConversationPreview({ template }: { template: InstagramTemplate }) {
  const { message, reply } = templatePreview(template);

  return (
    <div className="flex min-h-[168px] flex-col justify-center gap-2.5 border-b bg-background px-5 py-8 transition-colors duration-200 ease-out group-hover:bg-muted/50">
      <div className="flex items-end gap-2">
        <span
          className="h-6 w-6 shrink-0 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600"
          aria-hidden
        />
        <p className="max-w-[85%] rounded-[18px] rounded-bl-[6px] border bg-card px-3.5 py-2.5 text-[13px] leading-relaxed tracking-[-0.006em] text-foreground">
          {message}
        </p>
      </div>

      {reply?.kind === 'text' && (
        <div className="flex justify-end">
          <p className="max-w-[78%] rounded-[18px] rounded-br-[6px] bg-[#3797f0] px-3.5 py-2 text-[13px] leading-relaxed tracking-[-0.006em] text-white">
            {reply.label}
          </p>
        </div>
      )}

      {reply?.kind === 'chip' && (
        <div className="flex justify-end">
          <span className="rounded-full border border-[#3797f0] bg-[#3797f0]/10 px-3 py-1.5 text-[12px] font-medium tracking-[-0.01em] text-[#3797f0]">
            {reply.label}
          </span>
        </div>
      )}

      {/* Sem resposta da pessoa não há janela de 24h aberta, e a conversa
          termina na primeira mensagem. O espaço vazio seria uma mentira
          silenciosa sobre o alcance do modelo. */}
      {!reply && (
        <p className="pl-8 text-[12px] tracking-[-0.02em] text-muted-foreground">
          conversa fica aberta para o time
        </p>
      )}
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
  onPick,
}: {
  template: InstagramTemplate;
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
      <ConversationPreview template={template} />

      <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
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
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
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
          className="mb-1.5 inline-flex items-center gap-1 rounded-md text-[14px] tracking-[-0.009em] text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
                <TemplateCard key={template.id} template={template} onPick={onPick} />
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
