import { forwardRef, useRef, useState } from 'react';
import { Braces, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { FlowVariableGroup } from '@/lib/flowVariables';

const totalVariables = (groups: FlowVariableGroup[]) =>
  groups.reduce((sum, g) => sum + g.variables.length, 0);

interface VariablePickerProps {
  variables: FlowVariableGroup[];
  onInsert: (variableName: string) => void;
  className?: string;
}

/**
 * Botão pequeno que abre um popover listando as variáveis disponíveis,
 * agrupadas, com busca. Ao clicar numa variável chama onInsert(nome).
 */
export function VariablePicker({ variables, onInsert, className }: VariablePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const showSearch = totalVariables(variables) > 6;
  const normalizedQuery = query.trim().toLowerCase();

  const filteredGroups = normalizedQuery
    ? variables
        .map((group) => ({
          ...group,
          variables: group.variables.filter(
            (v) =>
              v.name.toLowerCase().includes(normalizedQuery) ||
              v.description.toLowerCase().includes(normalizedQuery),
          ),
        }))
        .filter((group) => group.variables.length > 0 || (!normalizedQuery && group.hint))
    : variables;

  const handleInsert = (name: string) => {
    onInsert(name);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('h-6 w-6 text-muted-foreground hover:text-foreground', className)}
          title="Inserir variável"
        >
          <Braces className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-border">
          <p className="text-xs font-semibold">Variáveis disponíveis</p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Clique para inserir como {'{{variavel}}'} no texto.
          </p>
        </div>

        {showSearch && (
          <div className="px-2 py-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar variável..."
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
        )}

        <div className="max-h-72 overflow-y-auto py-1">
          {filteredGroups.every((g) => g.variables.length === 0) && (
            <p className="px-3 py-4 text-xs text-muted-foreground text-center">
              Nenhuma variável encontrada.
            </p>
          )}

          {filteredGroups.map((group) => (
            <div key={group.label} className="px-1 py-1">
              <div className="px-2 pt-1 pb-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                {group.hint && (
                  <p className="text-[10px] text-muted-foreground/80 leading-tight">{group.hint}</p>
                )}
              </div>
              {group.variables.map((variable) => (
                <button
                  key={`${group.label}-${variable.name}`}
                  type="button"
                  onClick={() => handleInsert(variable.name)}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-muted transition-colors group"
                >
                  <code className="text-xs font-medium text-primary group-hover:underline">
                    {`{{${variable.name}}}`}
                  </code>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    {variable.description}
                  </p>
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Insere `token` na posição do cursor do campo, ou no final se não houver foco.
function insertAtCursor(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
  token: string,
  onValueChange: (next: string) => void,
) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const next = value.slice(0, start) + token + value.slice(end);
  onValueChange(next);

  // Reposiciona o cursor logo após o token inserido.
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    const pos = start + token.length;
    el.setSelectionRange(pos, pos);
  });
}

interface VariableTextareaProps
  extends Omit<React.ComponentProps<typeof Textarea>, 'onChange' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
  variables: FlowVariableGroup[];
}

/** Textarea com botão de inserir variável no canto superior direito. */
export const VariableTextarea = forwardRef<HTMLTextAreaElement, VariableTextareaProps>(
  ({ value, onValueChange, variables, className, ...props }, _ref) => {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    return (
      <div className="relative">
        <Textarea
          ref={innerRef}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className={cn('pr-9', className)}
          {...props}
        />
        <div className="absolute top-1.5 right-1.5">
          <VariablePicker
            variables={variables}
            onInsert={(name) => insertAtCursor(innerRef.current, value, `{{${name}}}`, onValueChange)}
          />
        </div>
      </div>
    );
  },
);
VariableTextarea.displayName = 'VariableTextarea';

interface VariableInputProps
  extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> {
  value: string;
  onValueChange: (value: string) => void;
  variables: FlowVariableGroup[];
}

/** Input de uma linha com botão de inserir variável ao lado. */
export const VariableInput = forwardRef<HTMLInputElement, VariableInputProps>(
  ({ value, onValueChange, variables, className, ...props }, _ref) => {
    const innerRef = useRef<HTMLInputElement>(null);
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={innerRef}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className={cn('flex-1', className)}
          {...props}
        />
        <VariablePicker
          variables={variables}
          onInsert={(name) => insertAtCursor(innerRef.current, value, `{{${name}}}`, onValueChange)}
        />
      </div>
    );
  },
);
VariableInput.displayName = 'VariableInput';
