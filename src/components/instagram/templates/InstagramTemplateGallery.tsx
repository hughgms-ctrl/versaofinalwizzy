import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
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
 */

interface InstagramTemplateGalleryProps {
  connectedAccounts: number;
  onPick: (template: InstagramTemplate) => void;
  onOpenFlows: () => void;
}

function useInstagramContactCount() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['instagram-contacts-count', profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return 0;
      const { count, error } = await (supabase
        .from('instagram_contacts' as 'contacts')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', profile.organization_id) as unknown as Promise<{ count: number | null; error: any }>);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!profile?.organization_id,
    staleTime: 60_000,
  });
}

/** A conversa em miniatura, no topo do cartão. */
function ConversationPreview({ template }: { template: InstagramTemplate }) {
  const { message, reply } = templatePreview(template);

  return (
    <div className="space-y-1.5 border-b bg-muted/40 px-4 py-4">
      <div className="flex">
        <p className="max-w-[88%] rounded-2xl rounded-bl-md border bg-card px-3 py-2 text-xs leading-relaxed text-foreground shadow-sm">
          {message}
        </p>
      </div>

      {reply?.kind === 'text' && (
        <div className="flex justify-end">
          <p className="max-w-[80%] rounded-2xl rounded-br-md bg-[#3797f0] px-3 py-1.5 text-xs leading-relaxed text-white">
            {reply.label}
          </p>
        </div>
      )}

      {reply?.kind === 'chip' && (
        <div className="flex justify-end">
          <span className="rounded-full border border-[#3797f0] px-2.5 py-1 text-[11px] font-medium text-[#3797f0]">
            {reply.label}
          </span>
        </div>
      )}

      {/* Sem resposta da pessoa não há janela de 24h aberta, e a conversa
          termina na primeira mensagem. O espaço vazio seria uma mentira
          silenciosa sobre o alcance do modelo. */}
      {!reply && (
        <p className="pl-1 pt-0.5 text-[11px] text-muted-foreground">
          conversa fica aberta para o time
        </p>
      )}
    </div>
  );
}

/** Os três passos, separados por seta. */
function Mechanism({ steps }: { steps: readonly string[] }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
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
        'transition-[transform,box-shadow,border-color] duration-200 ease-out',
        'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        // O destaque vem da borda, não de fundo colorido: um cartão tingido
        // entre seis brancos vira propaganda, não hierarquia.
        featured && 'border-primary/40',
      )}
    >
      <ConversationPreview template={template} />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-medium leading-snug transition-colors group-hover:text-primary">
            {template.title}
          </h4>
          {template.badge && (
            <Badge className="shrink-0 whitespace-nowrap font-normal">{template.badge}</Badge>
          )}
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">{template.description}</p>

        <div className="mt-auto border-t pt-3">
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
  const { data: contactCount = 0 } = useInstagramContactCount();

  const firstName = (profile?.full_name || '').trim().split(/\s+/)[0];

  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-xl font-semibold tracking-tight">
          {firstName ? `Olá, ${firstName}` : 'Comece por aqui'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {connectedAccounts === 0 ? (
            <>Conecte o Instagram em Configurações para começar a automatizar.</>
          ) : (
            <>
              {connectedAccounts} {connectedAccounts === 1 ? 'conta conectada' : 'contas conectadas'}
              {' · '}
              {contactCount.toLocaleString('pt-BR')} {contactCount === 1 ? 'contato' : 'contatos'}
            </>
          )}
        </p>
      </header>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-medium">Modelos prontos</h3>
        <button
          type="button"
          onClick={onOpenFlows}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Prefiro montar um fluxo
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {TEMPLATE_GROUPS.map((group) => {
        const items = INSTAGRAM_TEMPLATES.filter((t) => t.group === group.key);
        if (!items.length) return null;

        return (
          <section key={group.key} className="space-y-3">
            <div className="flex items-center gap-3">
              <h4 className="text-sm font-medium">{group.label}</h4>
              <span className="h-px flex-1 bg-border" aria-hidden />
              <span className="text-xs text-muted-foreground">{items.length} modelos</span>
            </div>

            {/* auto-fit em vez de breakpoints: os cartões se acomodam à largura
                real do conteúdo, que muda quando a barra lateral recolhe. */}
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
              {items.map((template) => (
                <TemplateCard key={template.id} template={template} onPick={onPick} />
              ))}
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <div>
          <p className="text-sm font-medium">{BLANK_TEMPLATE.title}</p>
          <p className="text-sm text-muted-foreground">{BLANK_TEMPLATE.description}</p>
        </div>
        <Button variant="outline" onClick={() => onPick(BLANK_TEMPLATE)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Criar do zero
        </Button>
      </div>
    </div>
  );
}
