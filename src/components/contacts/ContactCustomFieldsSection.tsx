import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useContactCustomFields } from '@/hooks/useContactCustomFields';
import { resolveContactCustomFields } from '@/lib/contactCustomFields';

interface ContactCustomFieldsSectionProps {
  /** `contacts.metadata` cru — a extração de custom_fields é feita aqui. */
  metadata: unknown;
  /** Quando true, mostra o bloco vazio em vez de sumir com ele. */
  showWhenEmpty?: boolean;
  title?: string;
  /**
   * Renderiza um <Separator /> DEPOIS do bloco. Fica aqui dentro (e não no
   * chamador) porque o bloco some quando o contato não tem nenhum campo
   * preenchido — no chamador o separador ficaria empilhado com o do bloco
   * anterior justamente nos contatos sem dado.
   */
  withSeparator?: boolean;
  className?: string;
}

/**
 * Exibição (só leitura) dos campos personalizados do contato.
 *
 * Existe porque o dado da triagem — gargalo, nível de consciência, objeção —
 * só tinha caminho de escrita: entrava por fluxo/IA/importação e não aparecia
 * em lugar nenhum da UI, então o vendedor abria o card antes de ligar sem ver
 * nada do que já tinha sido levantado.
 */
export function ContactCustomFieldsSection({
  metadata,
  showWhenEmpty = false,
  title = 'Campos personalizados',
  withSeparator = false,
  className,
}: ContactCustomFieldsSectionProps) {
  const { data: definitions = [] } = useContactCustomFields();
  const fields = resolveContactCustomFields(metadata, definitions);

  if (fields.length === 0 && !showWhenEmpty) return null;

  return (
    <>
      <div className={cn('space-y-2', className)}>
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">{title}</Label>

        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum campo preenchido ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {fields.map((field) => (
              <div
                key={field.key}
                className="flex items-baseline justify-between gap-3 rounded-md bg-muted/40 px-2.5 py-1.5"
              >
                <span
                  className="shrink-0 text-xs text-muted-foreground"
                  title={field.orphan ? `O campo "${field.key}" não existe mais no cadastro` : undefined}
                >
                  {field.label}
                </span>
                <span className="min-w-0 flex-1 text-right text-sm text-foreground break-words whitespace-pre-wrap">
                  {field.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {withSeparator && <Separator />}
    </>
  );
}
