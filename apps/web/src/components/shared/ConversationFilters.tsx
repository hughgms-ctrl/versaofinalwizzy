import { useMemo } from 'react';
import { Bot, MessageCircle, Filter, X, User, CircleDot, Calendar, Tag as TagIcon, Zap, Users, Clock, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
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

const datePresetLabel = (preset: DatePreset, range: DateRange): string => {
  if (preset === 'custom' && range.from) {
    const from = range.from.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const to = range.to ? ' - ' + range.to.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
    return `${from}${to}`;
  }
  const map: Record<string, string> = {
    today: 'Hoje',
    yesterday: 'Ontem',
    thisWeek: 'Esta semana',
    lastWeek: 'Semana passada',
    thisMonth: 'Este mês',
  };
  return map[preset as string] || (preset as string);
};

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

  const assignees = useMemo(() => {
    const assigneeIds = new Set<string>();
    conversations.forEach(conv => {
      if (conv.assigned_to) assigneeIds.add(conv.assigned_to);
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

  const selectedAssigneeLabel = (() => {
    if (filters.assigneeFilter === 'all') return null;
    if (filters.assigneeFilter === 'unassigned') return 'Sem atendente';
    const p = profiles?.find(pr => pr.user_id === filters.assigneeFilter);
    return p?.full_name?.split(' ')[0] || '1';
  })();

  const selectedStatusLabel = (() => {
    if (filters.statusFilter === 'all') return null;
    const map: Record<string, string> = {
      aberto: 'Aberto',
      em_andamento: 'Em andamento',
      encerrada: 'Encerradas',
      archived: 'Arquivados',
    };
    return map[filters.statusFilter] || null;
  })();

  const selectedTag = filters.tagFilter !== 'all' ? tags?.find(t => t.id === filters.tagFilter) : null;
  const selectedServiceMode = serviceModeOptions.find(o => o.value === filters.serviceMode);

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
        <DropdownMenuContent align="start" className="w-64 p-1 z-50 bg-popover">
          {/* Modo de atendimento */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <Zap className="h-3.5 w-3.5" />
              <span className="flex-1">Modo de atendimento</span>
              {filters.serviceMode !== 'all' && selectedServiceMode && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mr-1">
                  {selectedServiceMode.label}
                </Badge>
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-56 p-2 bg-popover">
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
                          onFiltersChange({
                            ...filters,
                            serviceMode: opt.value,
                            ...(opt.value !== 'all' ? { showArchived: false } : {}),
                          });
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
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          {/* Responsável */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <User className="h-3.5 w-3.5" />
              <span className="flex-1">Responsável</span>
              {selectedAssigneeLabel && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mr-1 max-w-[80px] truncate">
                  {selectedAssigneeLabel}
                </Badge>
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-56 p-2 bg-popover">
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
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          {/* Status */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <CircleDot className="h-3.5 w-3.5" />
              <span className="flex-1">Status</span>
              {selectedStatusLabel && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mr-1">
                  {selectedStatusLabel}
                </Badge>
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-56 p-2 bg-popover">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: 'all', label: 'Todos' },
                    { value: 'aberto', label: 'Aberto' },
                    { value: 'em_andamento', label: 'Em andamento' },
                    { value: 'encerrada', label: 'Encerradas' },
                    { value: 'archived', label: 'Arquivado' },
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
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          {/* Data */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <Calendar className="h-3.5 w-3.5" />
              <span className="flex-1">Data</span>
              {filters.datePreset !== 'all' && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mr-1 max-w-[100px] truncate">
                  {datePresetLabel(filters.datePreset, filters.dateRange)}
                </Badge>
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-72 p-2 bg-popover">
                <DateFilter
                  dateRange={filters.dateRange}
                  preset={filters.datePreset}
                  onDateChange={handleDateChange}
                />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          {/* Tags */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <TagIcon className="h-3.5 w-3.5" />
              <span className="flex-1">Tags</span>
              {selectedTag && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 mr-1 max-w-[80px] truncate"
                  style={{
                    backgroundColor: `${selectedTag.color}20`,
                    color: selectedTag.color,
                  }}
                >
                  {selectedTag.name}
                </Badge>
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="w-64 p-2 bg-popover max-h-[60vh] overflow-y-auto">
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
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuSeparator className="my-1" />

          {/* Filtros rápidos */}
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
