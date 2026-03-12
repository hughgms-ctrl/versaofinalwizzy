import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { ConversationList } from '@/components/conversations/ConversationList';
import { ConversationDetail } from '@/components/conversations/ConversationDetail';
import { ConversationFilters, ConversationFiltersState, defaultFilters } from '@/components/shared/ConversationFilters';
import { ServiceModeTabs, ServiceMode } from '@/components/conversations/ServiceModeTabs';
import { useConversations, DbConversation } from '@/hooks/useConversations';
import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { supabase } from '@/integrations/supabase/client';
import { isWithinInterval, parseISO } from 'date-fns';
import { MessageSquare, Loader2, Inbox, Search, X, Smartphone, Settings, ArrowLeft, Archive, EyeOff, MessageSquarePlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { useTags } from '@/hooks/useTags';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { NewConversationDialog } from '@/components/conversations/NewConversationDialog';
import { useUserPermissions, useCurrentUserRole } from '@/hooks/useUserPermissions';
import { useAuth } from '@/hooks/useAuth';
import { useConversationShares } from '@/hooks/useConversationShares';

const ConversationsPage = () => {
  const [selectedConversation, setSelectedConversation] = useState<DbConversation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<ConversationFiltersState>(defaultFilters);
  const [serviceMode, setServiceMode] = useState<ServiceMode>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [isSpyMode, setIsSpyMode] = useState(false);
  const [showNewConversationDialog, setShowNewConversationDialog] = useState(false);
  const { data: conversations, isLoading, error, refetch } = useConversations({ onlyArchived: showArchived });
  const { connected: whatsappConnected, isLoading: whatsappLoading } = useWhatsAppStatus();
  const { selectedWorkspace, selectedWorkspaceId } = useWorkspaceContext();
  const { user } = useAuth();
  const { data: userPermissions } = useUserPermissions();
  const { data: userRole } = useCurrentUserRole();
  const { data: myShares = [] } = useConversationShares();

  // Fetch contact tags for filtering
  const { data: allContactTags = [] } = useQuery({
    queryKey: ['all-contact-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_tags')
        .select('contact_id, tag_id');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch pipeline positions to filter conversations by pipeline access
  const isRestricted = userRole && userRole !== 'owner' && userRole !== 'admin';
  const hasPipelineRestriction = isRestricted && userPermissions?.pipeline_access_type === 'specific' && (userPermissions?.allowed_pipeline_ids?.length ?? 0) > 0;

  const { data: pipelinePositions = [] } = useQuery({
    queryKey: ['conversation-pipeline-positions-for-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_pipeline_positions')
        .select('conversation_id, pipeline_id');
      if (error) throw error;
      return data || [];
    },
    enabled: !!hasPipelineRestriction,
  });

  // Filter conversations by search query, all filters, and service mode
  const filteredConversations = useMemo(() => {
    if (!conversations) return [];

    const filterType = userPermissions?.conversations_filter_type || 'all';
    const allowedTags = userPermissions?.conversations_allowed_tags || [];
    const allowedPipelineIds = userPermissions?.allowed_pipeline_ids || [];

    const sharedConvIds = new Set(myShares.map(s => s.conversation_id));

    return conversations.filter(conv => {
      // Shared conversations always bypass permission filters
      const isSharedWithMe = sharedConvIds.has(conv.id);

      // === PERMISSION-BASED FILTER (for non-owner/admin users) ===
      if (isRestricted && filterType !== 'all' && !isSharedWithMe) {
        const isAssigned = conv.assigned_to === user?.id;
        const contactTagIds = allContactTags?.filter(ct => ct.contact_id === conv.contact?.id).map(ct => ct.tag_id) || [];
        const hasAllowedTag = allowedTags.length > 0 && allowedTags.some(tagId => contactTagIds.includes(tagId));

        if (filterType === 'assigned' && !isAssigned) return false;
        if (filterType === 'tags' && !hasAllowedTag) return false;
        if (filterType === 'assigned_and_tags' && !isAssigned && !hasAllowedTag) return false;
      }

      // === PIPELINE-BASED FILTER (for restricted users with specific pipeline access) ===
      if (hasPipelineRestriction && allowedPipelineIds.length > 0 && !isSharedWithMe) {
        const convPipelines = pipelinePositions.filter(pp => pp.conversation_id === conv.id);
        if (convPipelines.length > 0) {
          const isInAllowedPipeline = convPipelines.some(pp => allowedPipelineIds.includes(pp.pipeline_id));
          if (!isInAllowedPipeline) return false;
        }
      }

      // === WORKSPACE FILTER ===
      if (selectedWorkspaceId && selectedWorkspace) {
        const workspaceTagIds = selectedWorkspace.filter_tag_ids || [];
        if (workspaceTagIds.length > 0) {
          const contactTagIds = allContactTags?.filter(ct => ct.contact_id === conv.contact?.id).map(ct => ct.tag_id) || [];
          const hasWorkspaceTag = workspaceTagIds.some(tagId => contactTagIds.includes(tagId));
          if (!hasWorkspaceTag) return false;
        }
      }

      // Service mode filter (only when not showing archived)
      if (!showArchived && serviceMode !== 'all') {
        const convServiceMode = (conv as any).service_mode || 'pendente';
        if (convServiceMode !== serviceMode) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const name = conv.contact?.name?.toLowerCase() || '';
        const phone = conv.contact?.phone || '';
        if (!name.includes(query) && !phone.includes(query)) return false;
      }

      // Status filter
      if (filters.statusFilter !== 'all' && conv.status !== filters.statusFilter) return false;

      // Assignee filter
      if (filters.assigneeFilter !== 'all') {
        if (filters.assigneeFilter === 'unassigned' && conv.assigned_to !== null) return false;
        if (filters.assigneeFilter !== 'unassigned' && conv.assigned_to !== filters.assigneeFilter) return false;
      }

      // Tag filter
      if (filters.tagFilter !== 'all' && conv.contact?.id) {
        const contactTagIds = allContactTags?.filter(ct => ct.contact_id === conv.contact?.id).map(ct => ct.tag_id) || [];
        if (!contactTagIds.includes(filters.tagFilter)) return false;
      }

      // Unread filter
      if (filters.showOnlyUnread && conv.unread_count === 0) return false;

      // AI filter - check if last message is from bot
      if (filters.showOnlyAI) {
        const lastMessage = conv.last_message?.[0];
        if (!lastMessage?.is_from_bot) return false;
      }

      // Date filter
      if (filters.dateRange?.from && conv.last_message_at) {
        const convDate = parseISO(conv.last_message_at);
        const from = filters.dateRange.from;
        const to = filters.dateRange.to || filters.dateRange.from;
        if (!isWithinInterval(convDate, { start: from, end: to })) {
          return false;
        }
      }

      return true;
    });
  }, [conversations, searchQuery, filters, allContactTags, serviceMode, showArchived, selectedWorkspaceId, selectedWorkspace, userRole, userPermissions, user?.id, pipelinePositions, hasPipelineRestriction, myShares]);

  // Count conversations by service mode (filtered by workspace + permissions)
  const serviceModeCounts = useMemo(() => {
    if (!conversations) return { ia: 0, ativo: 0, pendente: 0 };

    const isRestricted = userRole && userRole !== 'owner' && userRole !== 'admin';
    const filterType = userPermissions?.conversations_filter_type || 'all';
    const allowedTags = userPermissions?.conversations_allowed_tags || [];

    const allowedPipelineIds = userPermissions?.allowed_pipeline_ids || [];

    const sharedConvIds = new Set(myShares.map(s => s.conversation_id));

    const workspaceFiltered = conversations.filter(conv => {
      if (conv.status === 'archived') return false;

      const isSharedWithMe = sharedConvIds.has(conv.id);

      // Permission filter
      if (isRestricted && filterType !== 'all' && !isSharedWithMe) {
        const isAssigned = conv.assigned_to === user?.id;
        const contactTagIds = allContactTags?.filter(ct => ct.contact_id === conv.contact?.id).map(ct => ct.tag_id) || [];
        const hasAllowedTag = allowedTags.length > 0 && allowedTags.some(tagId => contactTagIds.includes(tagId));

        if (filterType === 'assigned' && !isAssigned) return false;
        if (filterType === 'tags' && !hasAllowedTag) return false;
        if (filterType === 'assigned_and_tags' && !isAssigned && !hasAllowedTag) return false;
      }

      // Pipeline permission filter
      if (hasPipelineRestriction && allowedPipelineIds.length > 0 && !isSharedWithMe) {
        const convPipelines = pipelinePositions.filter(pp => pp.conversation_id === conv.id);
        if (convPipelines.length > 0) {
          const isInAllowedPipeline = convPipelines.some(pp => allowedPipelineIds.includes(pp.pipeline_id));
          if (!isInAllowedPipeline) return false;
        }
      }

      if (selectedWorkspaceId && selectedWorkspace) {
        const workspaceTagIds = selectedWorkspace.filter_tag_ids || [];
        if (workspaceTagIds.length > 0) {
          const contactTagIds = allContactTags?.filter(ct => ct.contact_id === conv.contact?.id).map(ct => ct.tag_id) || [];
          const hasWorkspaceTag = workspaceTagIds.some(tagId => contactTagIds.includes(tagId));
          if (!hasWorkspaceTag) return false;
        }
      }
      return true;
    });

    return workspaceFiltered.reduce((acc, conv) => {
      const mode = (conv as any).service_mode || 'pendente';
      if (mode in acc) {
        acc[mode as keyof typeof acc]++;
      }
      return acc;
    }, { ia: 0, ativo: 0, pendente: 0 });
  }, [conversations, selectedWorkspaceId, selectedWorkspace, allContactTags, userRole, userPermissions, user?.id, pipelinePositions, hasPipelineRestriction, myShares]);

  // Mark conversation as read when selected (unless spy mode)
  const handleSelectConversation = useCallback(async (conversation: DbConversation) => {
    setSelectedConversation(conversation);
    setIsSpyMode(false);

    // If there are unread messages, mark as read
    if (conversation.unread_count > 0) {
      try {
        await supabase
          .from('conversations')
          .update({ unread_count: 0 })
          .eq('id', conversation.id);

        // Refetch to update the list
        refetch();
      } catch (error) {
        console.error('Error marking conversation as read:', error);
      }
    }
  }, [refetch]);

  // Spy mode: view conversation without marking as read
  const handleSpyView = useCallback((conversation: DbConversation) => {
    setSelectedConversation(conversation);
    setIsSpyMode(true);
    // Don't mark as read - keep unread badge
  }, []);

  // Keep selected conversation in sync with updated data or clear if archived
  useEffect(() => {
    if (selectedConversation && conversations) {
      const updated = conversations.find(c => c.id === selectedConversation.id);
      if (updated) {
        if (JSON.stringify(updated) !== JSON.stringify(selectedConversation)) {
          setSelectedConversation(updated);
        }
      } else {
        // Conversation was archived or removed - clear selection
        setSelectedConversation(null);
      }
    }
  }, [conversations, selectedConversation]);

  // Show disconnected state if WhatsApp is not connected
  if (!whatsappLoading && !whatsappConnected) {
    return (
      <MainLayout
        title="Conversas"
        subtitle="Gerencie todas as suas conversas"
        showSearch={false}
        fullWidth
      >
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center p-8 max-w-md">
            <div className="h-20 w-20 rounded-2xl bg-yellow-500/10 flex items-center justify-center mx-auto mb-6">
              <Smartphone className="h-10 w-10 text-yellow-500" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Conecte seu WhatsApp</h2>
            <p className="text-muted-foreground mb-6">
              Para visualizar e gerenciar suas conversas, você precisa conectar seu WhatsApp nas configurações.
            </p>
            <Button asChild>
              <Link to="/settings">
                <Settings className="h-4 w-4 mr-2" />
                Ir para Configurações
              </Link>
            </Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title="Conversas"
      subtitle="Gerencie todas as suas conversas"
      showSearch={false}
      fullWidth
    >
      <div className="flex flex-col h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] overflow-hidden">
        {/* Fixed Header Row - Search + Filters aligned */}
        <div className="hidden md:flex items-center justify-between gap-4 px-4 py-2 border-b border-border bg-muted/30 flex-shrink-0">
          {/* Search - left side, fixed width to match sidebar */}
          <div className="w-80 lg:w-96 flex-shrink-0 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pesquisar conversas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9 bg-secondary/50 border-0 text-sm"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button
              size="icon"
              className="h-9 w-9 shrink-0 flex-none"
              title="Nova Conversa"
              onClick={() => setShowNewConversationDialog(true)}
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>

          {/* Filters - centered */}
          <div className="flex-1 flex items-center justify-center">
            <ConversationFilters
              conversations={conversations || []}
              filters={filters}
              onFiltersChange={setFilters}
              showCount={false}
            />
          </div>

          {/* Spacer to balance layout */}
          <div className="w-80 lg:w-96 flex-shrink-0" />
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Conversation List - Full width on mobile when no selection, side panel on desktop */}
          <div className={cn(
            "border-r border-border bg-card flex-shrink-0 overflow-hidden flex flex-col",
            "w-full md:w-80 lg:w-96 md:min-w-[320px] md:max-w-96",
            selectedConversation && "hidden md:flex"
          )}>
            {/* Mobile Search Bar */}
            <div className="p-2 border-b border-border md:hidden flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar conversas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 bg-secondary/50 border-0 text-sm"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Service Mode Tabs */}
            <div className="px-2 py-2 border-b border-border">
              <ServiceModeTabs
                value={serviceMode}
                onChange={(mode) => {
                  setServiceMode(mode);
                  setShowArchived(false);
                }}
                counts={serviceModeCounts}
              />
              {/* Arquivados Button - Below tabs, discrete */}
              <button
                onClick={() => {
                  setShowArchived(!showArchived);
                  if (!showArchived) {
                    setServiceMode('all');
                  }
                }}
                className={cn(
                  "flex items-center gap-1.5 text-xs mt-2 transition-colors",
                  showArchived
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Archive className="h-3.5 w-3.5" />
                Arquivados
              </button>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-full text-destructive p-4">
                  <p className="text-sm text-center">Erro ao carregar conversas</p>
                </div>
              ) : filteredConversations.length > 0 ? (
                <ConversationList
                  conversations={filteredConversations}
                  selectedId={selectedConversation?.id}
                  onSelect={handleSelectConversation}
                  onSpyView={handleSpyView}
                />
              ) : searchQuery || filters.datePreset !== 'all' || filters.statusFilter !== 'all' || filters.tagFilter !== 'all' || filters.showOnlyUnread || filters.showOnlyAI ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                  <Search className="h-12 w-12 mb-4 opacity-30" />
                  <p className="text-lg font-medium text-center">Nenhum resultado</p>
                  <p className="text-sm text-center mt-2">
                    Tente ajustar os filtros para encontrar o que procura.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                  <Inbox className="h-16 w-16 mb-4 opacity-30" />
                  <p className="text-lg font-medium text-center">Nenhuma conversa ainda</p>
                  <p className="text-sm text-center mt-2">
                    As conversas aparecerão aqui quando você receber mensagens no WhatsApp conectado.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Conversation Detail - Full width on mobile when selected */}
          <div className={cn(
            "flex-1 min-w-0 overflow-hidden flex flex-col",
            !selectedConversation && "hidden md:flex"
          )}>
            {selectedConversation ? (
              <div className="h-full flex flex-col">
                {/* Spy mode banner */}
                {isSpyMode && (
                  <div className="flex items-center justify-between px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 flex-shrink-0">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                      <EyeOff className="h-4 w-4" />
                      <span className="text-xs font-medium">Modo espião — visualizando sem marcar como lida</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700"
                      onClick={() => {
                        setIsSpyMode(false);
                        // Now mark as read
                        if (selectedConversation.unread_count > 0) {
                          supabase
                            .from('conversations')
                            .update({ unread_count: 0 })
                            .eq('id', selectedConversation.id)
                            .then(() => refetch());
                        }
                      }}
                    >
                      Marcar como lida
                    </Button>
                  </div>
                )}
                {/* Mobile back button */}
                <div className="md:hidden flex items-center gap-2 p-2 border-b border-border bg-card">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedConversation(null)}
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Voltar
                  </Button>
                  <span className="text-sm font-medium truncate">
                    {selectedConversation.contact?.name || selectedConversation.contact?.phone}
                  </span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <ConversationDetail conversation={selectedConversation} />
                </div>
              </div>
            ) : (
              <div className="hidden md:flex flex-col items-center justify-center h-full text-muted-foreground">
                <MessageSquare className="h-16 w-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">Selecione uma conversa</p>
                <p className="text-sm">Escolha uma conversa da lista para visualizar</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={showNewConversationDialog}
        onOpenChange={setShowNewConversationDialog}
        onConversationCreated={(conv) => {
          setSelectedConversation(conv);
          refetch(); // Ensure list updates
        }}
      />
    </MainLayout>
  );
};

export default ConversationsPage;
