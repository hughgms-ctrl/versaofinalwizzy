import { useState, useMemo } from 'react';
import { Bot, MessageCircle, ChevronDown, ChevronRight, Filter, X, User, CircleDot, SlidersHorizontal } from 'lucide-react';
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
import { DateFilter, DateRange, DatePreset, defaultDateFilter } from './DateFilter';

export interface ConversationFiltersState {
  statusFilter: string;
  assigneeFilter: string;
  tagFilter: string;
  showOnlyUnread: boolean;
  showOnlyAI: boolean;
  dateRange: DateRange;
  datePreset: DatePreset;
}

interface ConversationFiltersProps {
  conversations: DbConversation[];
  filters: ConversationFiltersState;
  onFiltersChange: (filters: ConversationFiltersState) => void;
  showCount?: boolean;
  filteredCount?: number;
}

const statusLabels: Record<string, string> = {
  open: 'Aberto',
  resolved: 'Resolvido',
  archived: 'Arquivado',
};

export function ConversationFilters({ 
  conversations, 
  filters, 
  onFiltersChange,
  showCount = true,
  filteredCount,
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
    });
  };

  const handleDateChange = (range: DateRange, preset: DatePreset) => {
    onFiltersChange({ ...filters, dateRange: range, datePreset: preset });
  };

  const getAssigneeName = (userId: string | null) => {
    if (!userId) return null;
    const profile = profiles?.find(p => p.user_id === userId);
    return profile?.full_name || null;
  };

  return (
    <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap overflow-x-auto scrollbar-hide">
      {/* Assignee Filter - Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <User className="h-3.5 w-3.5" />
            Responsável
            {filters.assigneeFilter !== 'all' && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-primary text-primary-foreground">
                1
              </Badge>
            )}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48 p-2">
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant={filters.assigneeFilter === 'all' ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => updateFilter('assigneeFilter', 'all')}
            >
              Todos
            </Button>
            <Button
              variant={filters.assigneeFilter === 'unassigned' ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => updateFilter('assigneeFilter', 'unassigned')}
            >
              Sem atendente
            </Button>
            {assignees.map((profile) => (
              <Button
                key={profile.id}
                variant={filters.assigneeFilter === profile.user_id ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => updateFilter('assigneeFilter', profile.user_id)}
              >
                {profile.full_name.split(' ')[0]}
              </Button>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Status Filter - Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <CircleDot className="h-3.5 w-3.5" />
            Status
            {filters.statusFilter !== 'all' && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-primary text-primary-foreground">
                1
              </Badge>
            )}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48 p-2">
          <div className="flex flex-wrap gap-1.5">
            {[
              { value: 'all', label: 'Todos' },
              { value: 'open', label: 'Abertos' },
              { value: 'resolved', label: 'Resolvidos' },
              { value: 'archived', label: 'Arquivados' },
            ].map((status) => (
              <Button
                key={status.value}
                variant={filters.statusFilter === status.value ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => updateFilter('statusFilter', status.value)}
              >
                {status.label}
              </Button>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* More Filters - Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Mais filtros
            {(filters.tagFilter !== 'all' || filters.showOnlyUnread || filters.showOnlyAI || filters.datePreset !== 'all') && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] bg-primary text-primary-foreground">
                {[
                  filters.tagFilter !== 'all',
                  filters.showOnlyUnread,
                  filters.showOnlyAI,
                  filters.datePreset !== 'all',
                ].filter(Boolean).length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 p-2 max-h-[70vh] overflow-y-auto z-50 bg-popover">
          {/* Date Section - Collapsible */}
          <Collapsible>
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
          <Collapsible>
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

          <DropdownMenuSeparator className="my-1" />

          {/* Quick Filters Section */}
          <div className="px-2 py-1.5">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Filtros rápidos</p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={filters.showOnlyUnread ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => updateFilter('showOnlyUnread', !filters.showOnlyUnread)}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Não lidas
              </Button>
              <Button
                variant={filters.showOnlyAI ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => updateFilter('showOnlyAI', !filters.showOnlyAI)}
              >
                <Bot className="h-3.5 w-3.5" />
                Atendidas por IA
              </Button>
            </div>
          </div>

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
};