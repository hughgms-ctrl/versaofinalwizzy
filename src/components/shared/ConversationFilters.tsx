import { useMemo } from 'react';
import { Bot, MessageCircle, ChevronRight, Filter, X, User, CircleDot, Calendar, Tag as TagIcon, Zap, Users, Clock, Archive } from 'lucide-react';
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
import { useProfiles, DbConversation } from '@/hooks/useConversations';
import { DateFilter, DateRange, DatePreset } from './DateFilter';

export type ServiceModeFilter = 'all' | 'ia' | 'ativo' | 'pendente';

export interface ConversationFiltersState {
  statusFilter: string;
  assigneeFilter: string;
  tagFilter: string;
  showOnlyUnread: boolean;
  showOnlyAI: boolean;
  dateRange: DateRange;
  datePreset: DatePreset;
  serviceMode: ServiceModeFilter;
  showArchived: boolean;
}

interface ConversationFiltersProps {
  conversations: DbConversation[];
  filters: ConversationFiltersState;
  onFiltersChange: (filters: ConversationFiltersState) => void;
  showCount?: boolean;
  filteredCount?: number;
  serviceModeCounts?: { ia: number; ativo: number; pendente: number };
}

const serviceModeOptions: { value: ServiceModeFilter; label: string; icon: typeof Users }[] = [
  { value: 'all', label: 'Todas', icon: Users },
  { value: 'pendente', label: 'Fila', icon: Clock },
  { value: 'ativo', label: 'Humano', icon: User },
  { value: 'ia', label: 'IA', icon: Bot },
];

export function ConversationFilters({
  conversations,
  filters,
  onFiltersChange,
  showCount = true,
  filteredCount,
  serviceModeCounts,
}: ConversationFiltersProps) {
  const { data: profiles } = useProfiles();
  const { data: tags } = useTags();

  // Get unique assignees from conversations
  const assignees = useMemo(() => {
    const assigneeIds = new Set<string>();
    conversations.forEach(conv => {
      if (conv.assigned_to) {
        assigneeIds.add(conv.assigned_to);
      }
    });
    return profiles?.filter(p => assigneeIds.has(p.user_id)) || [];
  }, [conversations, profiles]);

  const activeFiltersCount = [
    filters.statusFilter !== 'all',
    filters.assigneeFilter !== 'all',
    filters.tagFilter !== 'all',
    filters.showOnlyUnread,
    filters.showOnlyAI,
    filters.datePreset !== 'all',
    filters.serviceMode !== 'all',
    filters.showArchived,
  ].filter(Boolean).length;

  const updateFilter = <K extends keyof ConversationFiltersState>(key: K, value: ConversationFiltersState[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      statusFilter: 'all',
      assigneeFilter: 'all',
      tagFilter: 'all',
      showOnlyUnread: false,
      showOnlyAI: false,
      dateRange: { from: undefined, to: undefined },
      datePreset: 'all',
      serviceMode: 'all',
      showArchived: false,
    });
  };

  const handleDateChange = (range: DateRange, preset: DatePreset) => {
    onFiltersChange({ ...filters, dateRange: range, datePreset: preset });
  };

  return (
    <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2 text-xs">
            <Filter className="h-4 w-4" />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-primary text-primary-foreground">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80 p-2 max-h-[75vh] overflow-y-auto z-50 bg-popover">
          {/* Service Mode Section */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-accent rounded-md group">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" />
                Modo de atendimento
              </span>
              <div className="flex items-center gap-2">
                {filters.serviceMode !== 'all' && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {serviceModeOptions.find(o => o.value === filters.serviceMode)?.label}
                  </Badge>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 pb-2 pt-1">
              <div className="flex flex-wrap gap-1.5">
                {serviceModeOptions.map((opt) => {
                  const Icon = opt.icon;
                  const count = opt.value === 'all'
                    ? serviceModeCounts ? serviceModeCounts.ia + serviceModeCounts.ativo + serviceModeCounts.pendente : undefined
                    : serviceModeCounts?.[opt.value as keyof typeof serviceModeCounts];
                  const isActive = filters.serviceMode === opt.value;
                  return (
                    <Button
                      key={opt.value}
                      variant={isActive ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => {
                        updateFilter('serviceMode', opt.value);
                        if (opt.value !== 'all') updateFilter('showArchived', false);
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {opt.label}
                      {count !== undefined && count > 0 && (
                        <span className={`text-[10px] px-1 rounded ${isActive ? 'bg-primary-foreground/20' : 'bg-muted'}`}>
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant={filters.showArchived ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-xs gap-1.5 mt-2 w-full justify-start"
                onClick={() => {
                  const next = !filters.showArchived;
                  onFiltersChange({ ...filters, showArchived: next, serviceMode: next ? 'all' : filters.serviceMode });
                }}
              >
                <Archive className="h-3.5 w-3.5" />
                Mostrar arquivados
              </Button>
            </CollapsibleContent>
          </Collapsible>

          <DropdownMenuSeparator className="my-1" />

          {/* Assignee Section */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-accent rounded-md group">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Responsável
              </span>
              <div className="flex items-center gap-2">
                {filters.assigneeFilter !== 'all' && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">1</Badge>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 pb-2 pt-1">
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant={filters.assigneeFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => updateFilter('assigneeFilter', 'all')}
                >
                  Todos
                </Button>
                <Button
                  variant={filters.assigneeFilter === 'unassigned' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => updateFilter('assigneeFilter', 'unassigned')}
                >
                  Sem atendente
                </Button>
                {assignees.map((profile) => (
                  <Button
                    key={profile.id}
                    variant={filters.assigneeFilter === profile.user_id ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => updateFilter('assigneeFilter', profile.user_id)}
                  >
                    {profile.full_name.split(' ')[0]}
                  </Button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <DropdownMenuSeparator className="my-1" />

          {/* Status Section */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-accent rounded-md group">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <CircleDot className="h-3.5 w-3.5" />
                Status
              </span>
              <div className="flex items-center gap-2">
                {filters.statusFilter !== 'all' && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">1</Badge>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 pb-2 pt-1">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: 'all', label: 'Todos' },
                  { value: 'open', label: 'Abertos' },
                  { value: 'resolved', label: 'Resolvidos' },
                  { value: 'archived', label: 'Arquivados' },
                ].map((status) => (
                  <Button
                    key={status.value}
                    variant={filters.statusFilter === status.value ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => updateFilter('statusFilter', status.value)}
                  >
                    {status.label}
                  </Button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <DropdownMenuSeparator className="my-1" />

          {/* Date Section */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-accent rounded-md group">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Data
              </span>
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

          {/* Tags Section */}
          <Collapsible>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-accent rounded-md group">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <TagIcon className="h-3.5 w-3.5" />
                Tags
              </span>
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
                  variant={filters.tagFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => updateFilter('tagFilter', 'all')}
                >
                  Todas
                </Button>
                {tags?.map((tag) => (
                  <Button
                    key={tag.id}
                    variant={filters.tagFilter === tag.id ? 'default' : 'outline'}
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

          {/* Quick Filters Section */}
          <div className="px-2 py-1.5">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Filtros rápidos</p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={filters.showOnlyUnread ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => updateFilter('showOnlyUnread', !filters.showOnlyUnread)}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Não lidas
              </Button>
              <Button
                variant={filters.showOnlyAI ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => updateFilter('showOnlyAI', !filters.showOnlyAI)}
              >
                <Bot className="h-3.5 w-3.5" />
                Atendidas por IA
              </Button>
            </div>
          </div>

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
          {filteredCount} conversas
        </span>
      )}
    </div>
  );
}

export const defaultFilters: ConversationFiltersState = {
  statusFilter: 'all',
  assigneeFilter: 'all',
  tagFilter: 'all',
  showOnlyUnread: false,
  showOnlyAI: false,
  dateRange: { from: undefined, to: undefined },
  datePreset: 'all',
  serviceMode: 'all',
  showArchived: false,
};
