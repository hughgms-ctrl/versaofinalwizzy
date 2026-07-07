import { ChevronDown, ChevronRight, Filter, X, Calendar as CalendarIcon } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useTags } from '@/hooks/useTags';
import { useVisibleWorkspaces } from '@/hooks/useWorkspaces';
import { DateFilter, DateRange, DatePreset } from '@/components/shared/DateFilter';

export type FilterOperator = 'is' | 'is_not';
export type TriStateFilter = 'all' | 'yes' | 'no';

export interface ContactFiltersState {
  tagFilter: string;
  tagOperator: FilterOperator;
  workspaceFilter: string;
  workspaceOperator: FilterOperator;
  hasNote: TriStateFilter;
  hasEmail: TriStateFilter;
  dateRange: DateRange;
  datePreset: DatePreset;
}

function OperatorToggle({ value, onChange }: { value: FilterOperator; onChange: (value: FilterOperator) => void }) {
  return (
    <div className="flex items-center rounded-md border border-border overflow-hidden text-[10px]" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => onChange('is')}
        className={`px-1.5 py-0.5 ${value === 'is' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
      >
        é
      </button>
      <button
        type="button"
        onClick={() => onChange('is_not')}
        className={`px-1.5 py-0.5 border-l border-border ${value === 'is_not' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
      >
        não é
      </button>
    </div>
  );
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

  const activeFiltersCount = [
    filters.tagFilter !== 'all',
    filters.workspaceFilter !== 'all',
    filters.hasNote !== 'all',
    filters.hasEmail !== 'all',
    filters.datePreset !== 'all',
  ].filter(Boolean).length;

  const updateFilter = <K extends keyof ContactFiltersState>(key: K, value: ContactFiltersState[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearAllFilters = () => {
    onFiltersChange({ ...defaultContactFilters });
  };

  const handleDateChange = (range: DateRange, preset: DatePreset) => {
    onFiltersChange({ ...filters, dateRange: range, datePreset: preset });
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Filter className="h-3.5 w-3.5" />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-primary text-primary-foreground">
                {activeFiltersCount}
              </Badge>
            )}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 p-2 max-h-[70vh] overflow-y-auto z-50 bg-popover">
          {/* Date Section - Collapsible */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-accent rounded-md group">
              <span className="text-xs font-semibold text-muted-foreground">Data</span>
              <div className="flex items-center gap-2">
                {filters.datePreset !== 'all' && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {filters.datePreset === 'custom' && filters.dateRange.from
                      ? `${filters.dateRange.from.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}${filters.dateRange.to ? ' - ' + filters.dateRange.to.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}`
                      : filters.datePreset === 'today' ? 'Hoje'
                      : filters.datePreset === 'yesterday' ? 'Ontem'
                      : filters.datePreset === 'thisWeek' ? 'Esta semana'
                      : filters.datePreset === 'lastWeek' ? 'Semana passada'
                      : filters.datePreset === 'thisMonth' ? 'Este mês'
                      : filters.datePreset}
                  </Badge>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 pb-2 pt-1">
              <DateFilter
                dateRange={filters.dateRange}
                preset={filters.datePreset}
                onDateChange={handleDateChange}
              />
            </CollapsibleContent>
          </Collapsible>

          <DropdownMenuSeparator className="my-1" />
          {/* Tags Section - Collapsible */}
          <Collapsible defaultOpen>
            <div className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-accent rounded-md">
              <CollapsibleTrigger className="text-xs font-semibold text-muted-foreground text-left">
                Tags
              </CollapsibleTrigger>
              <div className="flex items-center gap-2">
                {filters.tagFilter !== 'all' && (
                  <OperatorToggle
                    value={filters.tagOperator}
                    onChange={(op) => updateFilter('tagOperator', op)}
                  />
                )}
                <CollapsibleTrigger className="flex items-center gap-2 group">
                  {filters.tagFilter !== 'all' && tags && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 gap-1"
                      style={{
                        backgroundColor: `${tags.find(t => t.id === filters.tagFilter)?.color}20`,
                        color: tags.find(t => t.id === filters.tagFilter)?.color,
                      }}
                    >
                      {tags.find(t => t.id === filters.tagFilter)?.name}
                    </Badge>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                </CollapsibleTrigger>
              </div>
            </div>
            <CollapsibleContent className="px-2 pb-2 pt-1">
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant={filters.tagFilter === 'all' ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => updateFilter('tagFilter', 'all')}
                >
                  Todas
                </Button>
                {tags?.map((tag) => (
                  <Button
                    key={tag.id}
                    variant={filters.tagFilter === tag.id ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => updateFilter('tagFilter', tag.id)}
                    style={filters.tagFilter === tag.id ? {
                      backgroundColor: tag.color,
                      borderColor: tag.color,
                    } : undefined}
                  >
                    <div
                      className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </Button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <DropdownMenuSeparator className="my-1" />
          {/* Workspace Section - Collapsible */}
          <Collapsible defaultOpen>
            <div className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-accent rounded-md">
              <CollapsibleTrigger className="text-xs font-semibold text-muted-foreground text-left">
                Workspace
              </CollapsibleTrigger>
              <div className="flex items-center gap-2">
                {filters.workspaceFilter !== 'all' && (
                  <OperatorToggle
                    value={filters.workspaceOperator}
                    onChange={(op) => updateFilter('workspaceOperator', op)}
                  />
                )}
                <CollapsibleTrigger className="flex items-center gap-2 group">
                  {filters.workspaceFilter !== 'all' && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {filters.workspaceFilter === 'unassigned'
                        ? 'Sem workspace'
                        : workspaces?.find(w => w.id === filters.workspaceFilter)?.name}
                    </Badge>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                </CollapsibleTrigger>
              </div>
            </div>
            <CollapsibleContent className="px-2 pb-2 pt-1">
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant={filters.workspaceFilter === 'all' ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => updateFilter('workspaceFilter', 'all')}
                >
                  Todos
                </Button>
                <Button
                  variant={filters.workspaceFilter === 'unassigned' ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => updateFilter('workspaceFilter', 'unassigned')}
                >
                  Sem workspace
                </Button>
                {workspaces?.map((workspace) => (
                  <Button
                    key={workspace.id}
                    variant={filters.workspaceFilter === workspace.id ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => updateFilter('workspaceFilter', workspace.id)}
                    style={filters.workspaceFilter === workspace.id ? {
                      backgroundColor: workspace.color,
                      borderColor: workspace.color,
                    } : undefined}
                  >
                    <div
                      className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: workspace.color }}
                    />
                    {workspace.name}
                  </Button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <DropdownMenuSeparator className="my-1" />
          {/* Other fields - Collapsible */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-accent rounded-md group">
              <span className="text-xs font-semibold text-muted-foreground">Outros</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 pb-2 pt-1 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Nota</span>
                <div className="flex gap-1">
                  {(['all', 'yes', 'no'] as const).map((v) => (
                    <Button
                      key={v}
                      variant={filters.hasNote === v ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => updateFilter('hasNote', v)}
                    >
                      {v === 'all' ? 'Todos' : v === 'yes' ? 'Tem' : 'Não tem'}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">E-mail</span>
                <div className="flex gap-1">
                  {(['all', 'yes', 'no'] as const).map((v) => (
                    <Button
                      key={v}
                      variant={filters.hasEmail === v ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => updateFilter('hasEmail', v)}
                    >
                      {v === 'all' ? 'Todos' : v === 'yes' ? 'Tem' : 'Não tem'}
                    </Button>
                  ))}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Clear Filters - Always visible */}
          <DropdownMenuSeparator className="my-1" />
          <div className="px-2 py-1.5">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearAllFilters}
              disabled={activeFiltersCount === 0}
              className="w-full h-8 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Limpar filtros {activeFiltersCount > 0 && `(${activeFiltersCount})`}
            </Button>
          </div>
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

export const defaultContactFilters: ContactFiltersState = {
  tagFilter: 'all',
  tagOperator: 'is',
  workspaceFilter: 'all',
  workspaceOperator: 'is',
  hasNote: 'all',
  hasEmail: 'all',
  dateRange: { from: undefined, to: undefined },
  datePreset: 'all',
};
