import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BLANK_TEMPLATE,
  INSTAGRAM_TEMPLATES,
  TEMPLATE_GROUPS,
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
 * DESENHO: uma lista, não uma grade de cartões.
 *
 * A primeira versão eram sete cartões iguais, cada um com um emoji. Dois
 * problemas, e o emoji era o menor deles. Cartões idênticos repetidos não criam
 * hierarquia — com sete opções do mesmo tamanho e peso, o olho não tem por onde
 * começar. E o emoji ocupava justamente o espaço mais nobre da linha sem dizer
 * nada: 💬 e 📧 não distinguem "manda o link" de "pede o e-mail".
 *
 * A lista resolve os dois. Uma superfície só, dividida por linhas, dá ordem de
 * leitura; e no lugar do emoji entra o MECANISMO em três passos
 * (comentário → DM de boas-vindas → link), que é literalmente a informação que
 * decide a escolha. Ler a linha já é entender a automação.
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

/** Os três passos, separados por seta. É o que substituiu o emoji. */
function Mechanism({ steps }: { steps: readonly string[] }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      {steps.map((step, index) => (
        <span key={step} className="inline-flex items-center gap-1.5">
          {index > 0 && <ArrowRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden />}
          {step}
        </span>
      ))}
    </p>
  );
}

function TemplateRow({
  template,
  onPick,
}: {
  template: InstagramTemplate;
  onPick: (t: InstagramTemplate) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(template)}
      className={cn(
        'group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors duration-150',
        'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      )}
    >
      <div className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium leading-snug">{template.title}</span>
          {template.badge && (
            <Badge variant="secondary" className="font-normal">{template.badge}</Badge>
          )}
        </span>
        <p className="mt-0.5 text-sm text-muted-foreground">{template.description}</p>
        <Mechanism steps={template.steps} />
      </div>

      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
        aria-hidden
      />
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
    <div className="max-w-3xl space-y-8">
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

      <section className="space-y-6">
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
            <div key={group.key} className="space-y-2">
              <p className="text-sm text-muted-foreground">{group.label}</p>
              {/* Uma superfície com linhas, e não um cartão por modelo: com sete
                  opções do mesmo peso, o olho não teria por onde começar. */}
              <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
                {items.map((template) => (
                  <TemplateRow key={template.id} template={template} onPick={onPick} />
                ))}
              </div>
            </div>
          );
        })}
      </section>

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
