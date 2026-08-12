import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, Instagram, Sparkles, Zap } from 'lucide-react';
import { BLANK_TEMPLATE, INSTAGRAM_TEMPLATES, type InstagramTemplate } from './instagramTemplates';

/**
 * A porta de entrada do Wizzy Engage.
 *
 * Antes, quem abria o módulo via uma lista vazia e um botão "Nova automação" —
 * e precisava saber de antemão o que queria montar. A tela em branco é o que
 * faz o cliente novo fechar a aba: automação é um assunto em que ninguém sabe o
 * que é possível até ver um exemplo.
 *
 * Os modelos resolvem isso mostrando resultados ("quem comenta recebe o link")
 * em vez de mecanismos ("gatilho", "ação", "escopo"). Escolher um abre o
 * formulário guiado já preenchido; o que sobra para a pessoa é trocar o texto e
 * o link.
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

function TemplateCard({
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
      className="group flex h-full flex-col rounded-xl border bg-card p-4 text-left transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="text-2xl leading-none" aria-hidden>{template.emoji}</span>
        {template.badge && (
          <Badge
            variant="secondary"
            className="bg-orange-500/10 text-[10px] font-bold tracking-wide text-orange-600 dark:text-orange-400"
          >
            {template.badge}
          </Badge>
        )}
      </div>

      <p className="font-medium leading-snug group-hover:text-primary">{template.title}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{template.description}</p>

      <div className="mt-auto flex items-center gap-1.5 pt-4 text-xs text-muted-foreground">
        <Zap className="h-3.5 w-3.5" />
        Automação rápida
        <Instagram className="ml-1 h-3.5 w-3.5" />
        IG
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
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {firstName ? `Olá, ${firstName}!` : 'Comece por aqui'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {connectedAccounts === 0 ? (
            <>Nenhuma conta conectada ainda — conecte o Instagram em Configurações para começar.</>
          ) : (
            <>
              {connectedAccounts} {connectedAccounts === 1 ? 'conta conectada' : 'contas conectadas'}
              {' · '}
              {contactCount.toLocaleString('pt-BR')} {contactCount === 1 ? 'contato' : 'contatos'}
            </>
          )}
        </p>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Comece aqui</h3>
          <Button variant="link" size="sm" onClick={onOpenFlows} className="gap-1 px-0">
            Prefiro montar um fluxo
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INSTAGRAM_TEMPLATES.map((template) => (
            <TemplateCard key={template.id} template={template} onPick={onPick} />
          ))}
        </div>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <p className="font-medium">{BLANK_TEMPLATE.title}</p>
              <p className="text-sm text-muted-foreground">{BLANK_TEMPLATE.description}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => onPick(BLANK_TEMPLATE)}>
            Criar do zero
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
