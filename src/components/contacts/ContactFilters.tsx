import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronDown, Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useTags } from '@/hooks/useTags';
import { useVisibleWorkspaces } from '@/hooks/useWorkspaces';
import { useAllPipelineColumns } from '@/hooks/usePipelines';
import { useProfiles } from '@/hooks/useConversations';

export type FilterField = 'tag' | 'workspace' | 'pipeline' | 'created_at' | 'assigned_to';
export type EqualityOperator = 'is' | 'is_not';
export type DateOperator = 'before' | 'after' | 'on';
export type FilterOperator = EqualityOperator | DateOperator;

export interface FilterCondition {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  // Significado depende de `field`: id da tag, id do workspace (ou 'unassigned'),
  // id da coluna de pipeline, id do usuário responsável, ou data ISO.
  value: string;
}

export interface ContactFiltersState {
  conditions: FilterCondition[];
}

export const defaultContactFilters: ContactFiltersState = { conditions: [] };

const FIELD_LABELS: Record<FilterField, string> = {
  tag: 'Tag',
  workspace: 'Workspace',
  pipeline: 'Pipeline',
  created_at: 'Data de criação',
  assigned_to: 'Responsável',
};

const FIELD_ORDER: FilterField[] = ['tag', 'workspace', 'pipeline', 'created_at', 'assigned_to'];

const DATE_OPERATOR_LABELS: Record<DateOperator, string> = {
  before: 'Antes de',
  after: 'Depois de',
  on: 'Em',
};

function isDateField(field: FilterField) {
  return field === 'created_at';
}

function listButtonClass(selected: boolean) {
  return `flex items-center gap-2 w-full px-2 py-1.5 text-xs text-left rounded-md hover:bg-accent transition-colors ${
    selected ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground'
  }`;
}

interface ContactFiltersProps {
  filters: ContactFiltersState;
  onFiltersChange: (filters: ContactFiltersState) => void;
  showCount?: boolean;
  filteredCount?: number;
}

export function ContactFilters({
  filters,
  onFiltersChange,
  showCount = true,
  filteredCount,
}: ContactFiltersProps) {
  const { data: tags } = useTags();
  const { data: workspaces } = useVisibleWorkspaces();
  const { data: pipelinesWithColumns } = useAllPipelineColumns();
  const { data: profiles } = useProfiles();

  // Estado da condição em construção (colunas 1/2/3), ainda não adicionada à lista.
  const [builderField, setBuilderField] = useState<FilterField | null>(null);
  const [builderOperator, setBuilderOperator] = useState<FilterOperator | null>(null);

  const resetBuilder = () => {
    setBuilderField(null);
    setBuilderOperator(null);
  };

  const selectField = (field: FilterField) => {
    setBuilderField(field);
    setBuilderOperator(null);
  };

  const commitCondition = (value: string) => {
    if (!builderField || !builderOperator) return;
    const condition: FilterCondition = {
      id: crypto.randomUUID(),
      field: builderField,
      operator: builderOperator,
      value,
    };
    onFiltersChange({ conditions: [...filters.conditions, condition] });
    resetBuilder();
  };

  const removeCondition = (id: string) => {
    onFiltersChange({ conditions: filters.conditions.filter((c) => c.id !== id) });
  };

  const clearAllFilters = () => {
    onFiltersChange({ conditions: [] });
    resetBuilder();
  };

  const describeCondition = (condition: FilterCondition): string => {
    const fieldLabel = FIELD_LABELS[condition.field];

    if (condition.field === 'created_at') {
      const opLabel = DATE_OPERATOR_LABELS[condition.operator as DateOperator].toLowerCase();
      let dateLabel = condition.value;
      try {
        dateLabel = format(new Date(condition.value), 'dd/MM/yyyy', { locale: ptBR });
      } catch {
        // mantém valor bruto se a data for inválida
      }
      return `${fieldLabel} ${opLabel} ${dateLabel}`;
    }

    const opLabel = condition.operator === 'is_not' ? 'não é' : 'é';
    let valueLabel = condition.value;

    if (condition.field === 'tag') {
      valueLabel = tags?.find((t) => t.id === condition.value)?.name || condition.value;
    } else if (condition.field === 'workspace') {
      valueLabel = condition.value === 'unassigned'
        ? 'Sem workspace'
        : workspaces?.find((w) => w.id === condition.value)?.name || condition.value;
    } else if (condition.field === 'pipeline') {
      for (const p of pipelinesWithColumns || []) {
        const col = p.columns.find((c) => c.id === condition.value);
        if (col) {
          valueLabel = `${p.pipeline.name} / ${col.name}`;
          break;
        }
      }
    } else if (condition.field === 'assigned_to') {
      valueLabel = profiles?.find((p) => p.user_id === condition.value)?.full_name || condition.value;
    }

    return `${fieldLabel} ${opLabel} ${valueLabel}`;
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu onOpenChange={(open) => { if (!open) resetBuilder(); }}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Filter className="h-3.5 w-3.5" />
            Filtros
            {filters.conditions.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-primary text-primary-foreground">
                {filters.conditions.length}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[560px] max-w-[92vw] p-3 max-h-[75vh] overflow-y-auto z-50 bg-popover">
          {/* Condições ativas (chips removíveis) */}
          {filters.conditions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {filters.conditions.map((condition) => (
                <Badge key={condition.id} variant="secondary" className="gap-1 pr-1 text-[11px] font-normal">
                  {describeCondition(condition)}
                  <button
                    type="button"
                    onClick={() => removeCondition(condition.id)}
                    className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">
            Adicionar filtro
          </p>

          {/* Construtor sequencial: 1. tipo -> 2. operador -> 3. valor */}
          <div className="grid grid-cols-3 gap-2">
            {/* Coluna 1: tipo de filtro */}
            <div className="flex flex-col gap-0.5 border-r border-border pr-2">
              {FIELD_ORDER.map((field) => (
                <button
                  key={field}
                  type="button"
                  onClick={() => selectField(field)}
                  className={listButtonClass(builderField === field)}
                >
                  {FIELD_LABELS[field]}
                </button>
              ))}
            </div>

            {/* Coluna 2: operador */}
            <div className="flex flex-col gap-0.5 border-r border-border pr-2">
              {!builderField && (
                <p className="text-[11px] text-muted-foreground/60 px-2 py-1.5">Escolha um tipo</p>
              )}
              {builderField && !isDateField(builderField) && (
                <>
                  <button
                    type="button"
                    onClick={() => setBuilderOperator('is')}
                    className={listButtonClass(builderOperator === 'is')}
                  >
                    É
                  </button>
                  <button
                    type="button"
                    onClick={() => setBuilderOperator('is_not')}
                    className={listButtonClass(builderOperator === 'is_not')}
                  >
                    Não é
                  </button>
                </>
              )}
              {builderField && isDateField(builderField) && (
                <>
                  {(Object.keys(DATE_OPERATOR_LABELS) as DateOperator[]).map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => setBuilderOperator(op)}
                      className={listButtonClass(builderOperator === op)}
                    >
                      {DATE_OPERATOR_LABELS[op]}
                    </button>
                  ))}
                </>
              )}
            </div>

            {/* Coluna 3: valor */}
            <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
              {(!builderField || !builderOperator) && (
                <p className="text-[11px] text-muted-foreground/60 px-2 py-1.5">Escolha o operador</p>
              )}

              {builderField === 'tag' && builderOperator && (
                <>
                  {tags?.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => commitCondition(tag.id)}
                      className={listButtonClass(false)}
                    >
                      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                      <span className="truncate">{tag.name}</span>
                    </button>
                  ))}
                  {!tags?.length && <p className="text-[11px] text-muted-foreground/60 px-2 py-1.5">Nenhuma tag criada</p>}
                </>
              )}

              {builderField === 'workspace' && builderOperator && (
                <>
                  <button type="button" onClick={() => commitCondition('unassigned')} className={listButtonClass(false)}>
                    Sem workspace
                  </button>
                  {workspaces?.map((workspace) => (
                    <button
                      key={workspace.id}
                      type="button"
                      onClick={() => commitCondition(workspace.id)}
                      className={listButtonClass(false)}
                    >
                      <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: workspace.color }} />
                      <span className="truncate">{workspace.name}</span>
                    </button>
                  ))}
                </>
              )}

              {builderField === 'pipeline' && builderOperator && (
                <>
                  {pipelinesWithColumns?.map((p) => (
                    <div key={p.pipeline.id}>
                      <p className="px-2 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                        {p.pipeline.name}
                      </p>
                      {p.columns.map((column) => (
                        <button
                          key={column.id}
                          type="button"
                          onClick={() => commitCondition(column.id)}
                          className={listButtonClass(false)}
                        >
                          <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: column.color || '#888' }} />
                          <span className="truncate">{column.name}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                  {!pipelinesWithColumns?.length && (
                    <p className="text-[11px] text-muted-foreground/60 px-2 py-1.5">Nenhum pipeline criado</p>
                  )}
                </>
              )}

              {builderField === 'assigned_to' && builderOperator && (
                <>
                  {profiles?.map((profile) => (
                    <button
                      key={profile.user_id}
                      type="button"
                      onClick={() => commitCondition(profile.user_id)}
                      className={listButtonClass(false)}
                    >
                      <span className="truncate">{profile.full_name}</span>
                    </button>
                  ))}
                  {!profiles?.length && <p className="text-[11px] text-muted-foreground/60 px-2 py-1.5">Nenhum membro na equipe</p>}
                </>
              )}

              {builderField === 'created_at' && builderOperator && (
                <Calendar
                  mode="single"
                  selected={undefined}
                  onSelect={(date) => date && commitCondition(date.toISOString())}
                  locale={ptBR}
                  className="pointer-events-auto p-0"
                />
              )}
            </div>
          </div>

          <DropdownMenuSeparator className="my-2" />
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            disabled={filters.conditions.length === 0}
            className="w-full h-8 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            Limpar filtros {filters.conditions.length > 0 && `(${filters.conditions.length})`}
          </Button>
        </DropdownMenuContent>
      </DropdownMenu>

      {showCount && filteredCount !== undefined && (
        <span className="text-xs text-muted-foreground">
          {filteredCount} contatos
        </span>
      )}
    </div>
  );
}
