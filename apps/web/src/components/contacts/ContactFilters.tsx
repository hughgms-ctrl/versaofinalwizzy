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
import { DateFilter, DateRange, DatePreset } from '@/components/shared/DateFilter';

export interface ContactFiltersState {
  tagFilter: string;
  dateRange: DateRange;
  datePreset: DatePreset;
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

  const activeFiltersCount = [
    filters.tagFilter !== 'all',
    filters.datePreset !== 'all',
  ].filter(Boolean).length;

  const updateFilter = <K extends keyof ContactFiltersState>(key: K, value: ContactFiltersState[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      tagFilter: 'all',
      dateRange: { from: undefined, to: undefined },
      datePreset: 'all',
    });
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
            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-accent rounded-md group">
              <span className="text-xs font-semibold text-muted-foreground">Tags</span>
              <div className="flex items-center gap-2">
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
              </div>
            </CollapsibleTrigger>
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
  dateRange: { from: undefined, to: undefined },
  datePreset: 'all',
};
