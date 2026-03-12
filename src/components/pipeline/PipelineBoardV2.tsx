import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useConversations, DbConversation } from '@/hooks/useConversations';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { GripVertical, Loader2, Inbox, MessageCircle, Bot, Check, CheckCheck, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConversationCardActions } from '@/components/conversations/ConversationCardActions';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Pipeline,
  usePipelineColumns,
  useConversationPositions,
  useMoveConversation
} from '@/hooks/usePipelines';
import { ConversationFiltersState } from '@/components/shared/ConversationFilters';
import { useUserPermissions, useCurrentUserRole } from '@/hooks/useUserPermissions';
import { useTags } from '@/hooks/useTags';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PipelineBoardProps {
  pipeline: Pipeline | null;
  filters: ConversationFiltersState;
  searchQuery?: string;
  onConversationClick: (conversation: DbConversation) => void;
}

export function PipelineBoard({ pipeline, filters, searchQuery = '', onConversationClick }: PipelineBoardProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { selectedWorkspace, selectedWorkspaceId, isAdmin } = useWorkspaceContext();
  const { data: conversations, isLoading: conversationsLoading } = useConversations();
  const { data: columns = [], isLoading: columnsLoading } = usePipelineColumns(pipeline?.id || null);
  const { data: positions = [] } = useConversationPositions(pipeline?.id || null);
  const moveConversation = useMoveConversation();
  const { data: userPermissions } = useUserPermissions();
  const { data: userRole } = useCurrentUserRole();
  const { data: tags = [] } = useTags();

  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Admin preference to hide unassigned column (localStorage)
  const [adminHideUnassigned, setAdminHideUnassigned] = useState(() => {
    if (!pipeline?.id) return false;
    try {
      const stored = JSON.parse(localStorage.getItem('admin_hide_unassigned_pipelines') || '[]');
      return Array.isArray(stored) && stored.includes(pipeline.id);
    } catch { return false; }
  });

  useEffect(() => {
    if (!pipeline?.id) return;
    try {
      const stored = JSON.parse(localStorage.getItem('admin_hide_unassigned_pipelines') || '[]');
      setAdminHideUnassigned(Array.isArray(stored) && stored.includes(pipeline.id));
    } catch { setAdminHideUnassigned(false); }
  }, [pipeline?.id]);

  const toggleAdminHideUnassigned = useCallback(() => {
    if (!pipeline?.id) return;
    setAdminHideUnassigned(prev => {
      const newVal = !prev;
      try {
        const stored = JSON.parse(localStorage.getItem('admin_hide_unassigned_pipelines') || '[]');
        const arr = Array.isArray(stored) ? stored : [];
        const updated = newVal ? [...arr, pipeline.id] : arr.filter((id: string) => id !== pipeline.id);
        localStorage.setItem('admin_hide_unassigned_pipelines', JSON.stringify(updated));
      } catch {}
      return newVal;
    });
  }, [pipeline?.id]);

  // Ultra-lightweight Trello-style horizontal pan (no React state during pan = zero lag)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pan = useRef({ active: false, lastX: 0, vel: 0, lastT: 0, moved: false, acc: 0, pid: -1 });
  const rafId = useRef<number | null>(null);

  const stopRaf = useCallback(() => { if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null; } }, []);

  const setCursor = useCallback((grabbing: boolean) => {
    const c = scrollContainerRef.current;
    if (c) c.style.cursor = grabbing ? 'grabbing' : 'grab';
  }, []);

  const momentum = useCallback(() => {
    const c = scrollContainerRef.current;
    if (!c) return;
    let v = -pan.current.vel;
    if (Math.abs(v) < 0.08) return;
    let t = performance.now();
    const tick = (now: number) => {
      const dt = now - t; t = now;
      c.scrollLeft += v * dt;
      v *= 0.94 ** (dt / 16);
      rafId.current = Math.abs(v) >= 0.08 ? requestAnimationFrame(tick) : null;
    };
    stopRaf();
    rafId.current = requestAnimationFrame(tick);
  }, [stopRaf]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // On touch devices, allow native scroll (don't hijack gestures)
    if (e.pointerType !== 'mouse') return;
    if (e.button !== 0) return;
    // Don't start pan if a card is being dragged
    if (draggedCard) return;
    const t = e.target as HTMLElement;
    if (t.closest('.pipeline-card, button, a, input, textarea, select, [role="button"], [role="menu"], [role="menuitem"]')) return;
    const c = scrollContainerRef.current;
    if (!c) return;
    e.preventDefault();
    stopRaf();
    Object.assign(pan.current, { active: true, lastX: e.clientX, vel: 0, lastT: performance.now(), moved: false, acc: 0, pid: e.pointerId });
    setCursor(true);
    try { c.setPointerCapture(e.pointerId); } catch { }
  }, [stopRaf, setCursor, draggedCard]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const p = pan.current;
    if (!p.active) return;
    const c = scrollContainerRef.current;
    if (!c) return;
    const dx = e.clientX - p.lastX;
    p.lastX = e.clientX;
    if (!p.moved) { p.acc += Math.abs(dx); if (p.acc < 3) return; p.moved = true; document.body.style.userSelect = 'none'; }
    e.preventDefault();
    c.scrollLeft -= dx;
    const now = performance.now(), dt = now - p.lastT;
    if (dt > 0) { p.vel = p.vel * 0.5 + (dx / dt) * 0.5; p.lastT = now; }
  }, []);

  const endPan = useCallback(() => {
    const p = pan.current;
    if (!p.active) return;
    p.active = false;
    setCursor(false);
    const c = scrollContainerRef.current;
    if (c && p.pid >= 0) try { c.releasePointerCapture(p.pid); } catch { }
    document.body.style.userSelect = '';
    if (p.moved) momentum();
  }, [momentum, setCursor]);

  const handlePointerUp = useCallback(() => endPan(), [endPan]);
  const handlePointerCancel = useCallback(() => endPan(), [endPan]);

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

  // Apply all filters to conversations (including search)
  const filteredConversations = useMemo(() => {
    if (!conversations) return [];

    return conversations.filter(conv => {
      // === WORKSPACE FILTER (must come first) ===
      // When a workspace is selected, only show contacts that have at least one of the workspace's tags
      if (selectedWorkspaceId && selectedWorkspace) {
        const workspaceTagIds = selectedWorkspace.filter_tag_ids || [];
        if (workspaceTagIds.length > 0) {
          const contactTagIds = allContactTags?.filter(ct => ct.contact_id === conv.contact?.id).map(ct => ct.tag_id) || [];
          const hasWorkspaceTag = workspaceTagIds.some(tagId => contactTagIds.includes(tagId));
          if (!hasWorkspaceTag) return false;
        }
      }

      // Search filter (name or phone)
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
  }, [conversations, filters, searchQuery, allContactTags, selectedWorkspaceId, selectedWorkspace]);

  // Map conversations to columns
  const getConversationsByColumn = (columnId: string) => {
    const positionMap = new Map(positions.map(p => [p.conversation_id, p.column_id]));
    return filteredConversations.filter(c => positionMap.get(c.id) === columnId);
  };

  // Get unassigned conversations (not in any column of this pipeline)
  const unassignedConversations = useMemo(() => {
    const assignedIds = new Set(positions.map(p => p.conversation_id));
    return filteredConversations.filter(c => !assignedIds.has(c.id));
  }, [filteredConversations, positions]);

  const handleDragStart = (e: React.DragEvent, conversationId: string) => {
    setDraggedCard(conversationId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', conversationId);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColumn(columnId);

    // Auto-scroll horizontally when dragging near edges
    const container = scrollContainerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const scrollSpeed = 15;
      const edgeThreshold = 80;

      if (e.clientX < rect.left + edgeThreshold) {
        container.scrollLeft -= scrollSpeed;
      } else if (e.clientX > rect.right - edgeThreshold) {
        container.scrollLeft += scrollSpeed;
      }
    }
  };

  const handleDrop = async (e: React.DragEvent, columnId: string | null) => {
    e.preventDefault();
    if (draggedCard && pipeline) {
      if (columnId === null) {
        // Remove from pipeline (move to unassigned)
        await supabase
          .from('conversation_pipeline_positions')
          .delete()
          .eq('conversation_id', draggedCard)
          .eq('pipeline_id', pipeline.id);
        // Invalidate positions query to refresh UI
        queryClient.invalidateQueries({ queryKey: ['conversation-positions', pipeline.id] });
        queryClient.invalidateQueries({ queryKey: ['conversation-positions'] });
      } else {
        await moveConversation.mutateAsync({
          conversationId: draggedCard,
          pipelineId: pipeline.id,
          columnId,
        });
      }
    }
    setDraggedCard(null);
    setDragOverColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
    setDragOverColumn(null);
  };

  const getInitials = (name: string | null, phone: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    }
    return phone.slice(-2);
  };

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    if (cleaned.length === 12) {
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
    }
    return phone;
  };

  const stripMarkdown = (text: string | null) => {
    if (!text) return null;
    return text.replace(/[*_~`]/g, '');
  };

  const getLastMessagePreview = (conversation: DbConversation) => {
    const lastMessage = conversation.last_message?.[0];
    if (!lastMessage) return null;
    if (lastMessage.type !== 'text') {
      const typeLabels: Record<string, string> = {
        image: '📷 Imagem',
        audio: '🎵 Áudio',
        video: '🎥 Vídeo',
        document: '📄 Documento',
        sticker: '😀 Sticker',
        location: '📍 Localização',
      };
      return typeLabels[lastMessage.type] || '📎 Mídia';
    }
    return stripMarkdown(lastMessage.content);
  };

  const isLoading = conversationsLoading || columnsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Inbox className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">Selecione ou crie um pipeline</p>
        <p className="text-sm text-center mt-2">
          Use o seletor acima para escolher um pipeline existente ou criar um novo.
        </p>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Inbox className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">Pipeline sem colunas</p>
        <p className="text-sm text-center mt-2">
          Configure este pipeline para adicionar colunas.
        </p>
      </div>
    );
  }

  const renderConversationCard = (conversation: DbConversation) => {
    const hasName = !!conversation.contact?.name;
    const contactName = conversation.contact?.name;
    const contactPhone = conversation.contact?.phone || '';
    const formattedPhone = formatPhoneNumber(contactPhone);
    const hasUnread = conversation.unread_count > 0;
    const lastMessage = conversation.last_message?.[0];
    const isAIActive = lastMessage?.is_from_bot;
    const messagePreview = getLastMessagePreview(conversation);

    // Real presence logic using contact_presence table
    const presenceData = conversation.contact?.contact_presence;
    const presence = Array.isArray(presenceData) ? presenceData[0] : presenceData;
    const isActive = presence ? new Date(presence.expires_at) > new Date() : false;
    const isOnline = isActive && presence?.presence_type !== 'offline';
    const isTyping = isActive && presence?.presence_type === 'typing';
    const isRecording = isActive && presence?.presence_type === 'recording';

    return (
      <div
        key={conversation.id}
        draggable
        onDragStart={(e) => handleDragStart(e, conversation.id)}
        onDragEnd={handleDragEnd}
        onClick={() => onConversationClick(conversation)}
        className={cn(
          "pipeline-card",
          draggedCard === conversation.id && "dragging",
          hasUnread && "bg-primary/5"
        )}
      >
        <div className="flex items-start gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground/50 mt-1 cursor-grab flex-shrink-0" />

          {/* Avatar with indicator */}
          <div className="relative flex-shrink-0">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center relative">
              {conversation.contact?.avatar_url ? (
                <img
                  src={conversation.contact.avatar_url}
                  alt={contactName || contactPhone}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <span className="text-xs font-semibold text-primary">
                  {getInitials(contactName || null, contactPhone)}
                </span>
              )}

              {/* Online Status Dot - only show when presence is active */}
              {isOnline && (
                <div className={cn(
                  "absolute top-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-card",
                  isTyping ? "bg-blue-500 animate-pulse" : isRecording ? "bg-red-500 animate-pulse" : "bg-green-500"
                )} />
              )}
            </div>

            <div className={cn(
              "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center ring-2 ring-card",
              isAIActive ? "bg-purple-500" : "bg-green-500"
            )}>
              {isAIActive ? (
                <Bot className="h-2.5 w-2.5 text-white" />
              ) : (
                <MessageCircle className="h-2.5 w-2.5 text-white" />
              )}
            </div>
          </div>

          {/* Content - overflow hidden to contain all truncated text */}
          <div className="flex-1 min-w-0 overflow-hidden">
            {/* Content Lines */}
            {(() => {
              const metadata = conversation.contact?.metadata as { note?: string } | null;
              const note = metadata?.note;

              return (
                <div className="flex flex-col gap-0.5">
                  {/* Row 1: Note (if exists) + Time/Unread/Actions */}
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    {note && (
                      <span
                        className="text-xs font-semibold px-2 py-0.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 rounded truncate min-w-0 flex-1"
                        title={note}
                      >
                        {note}
                      </span>
                    )}

                    <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                      {conversation.last_message_at && (
                        <span className={cn(
                          "text-[10px] whitespace-nowrap",
                          hasUnread ? "text-primary font-medium" : "text-muted-foreground"
                        )}>
                          {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: false, locale: ptBR })}
                        </span>
                      )}
                      {hasUnread && (
                        <span className="h-5 min-w-[20px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                          {conversation.unread_count}
                        </span>
                      )}
                      <ConversationCardActions
                        conversation={conversation}
                        variant="minimal"
                        onOpenChat={() => onConversationClick(conversation)}
                      />
                    </div>
                  </div>

                  {/* Row 2: Name + Phone */}
                  {note ? (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className={cn(
                        "text-[11px] truncate flex-1 min-w-0",
                        hasUnread ? "font-bold text-foreground" : "font-medium text-muted-foreground"
                      )}>
                        {hasName ? contactName : formattedPhone}
                      </p>
                      {hasName && (
                        <p className="text-[10px] text-muted-foreground/70 truncate flex-shrink-0">
                          • {formattedPhone}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <p className={cn(
                        "text-sm truncate flex-1 min-w-0",
                        hasUnread ? "font-bold text-foreground" : "font-medium text-foreground"
                      )}>
                        {hasName ? contactName : formattedPhone}
                      </p>
                    </div>
                  )}
                  {!note && hasName && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {formattedPhone}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Row 3: Last message preview / Status indicator */}
            <div className="flex items-center gap-1 mt-1">
              {lastMessage?.direction === 'outbound' && (
                <span className="flex-shrink-0 flex items-center">
                  {lastMessage.read_at ? (
                    <CheckCheck className="text-blue-500 h-3 w-3 stroke-[3]" />
                  ) : (lastMessage.delivered_at || lastMessage.read_at) ? (
                    <CheckCheck className="text-muted-foreground/60 h-3 w-3 stroke-[3]" />
                  ) : (
                    <Check className="text-muted-foreground/60 h-3 w-3 stroke-[3]" />
                  )}
                </span>
              )}
              {isTyping || isRecording ? (
                <p className="text-[11px] text-green-500 font-medium animate-pulse truncate flex-1 min-w-0">
                  {isTyping ? 'Digitando...' : 'Gravando áudio...'}
                </p>
              ) : messagePreview ? (
                <p className={cn(
                  "text-[11px] truncate flex-1 min-w-0",
                  hasUnread ? "text-foreground font-medium" : "text-muted-foreground"
                )}>
                  {messagePreview}
                </p>
              ) : (
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-medium",
                    conversation.status === 'open' && "bg-green-500/10 text-green-500",
                    conversation.status === 'resolved' && "bg-blue-500/10 text-blue-500",
                    conversation.status === 'archived' && "bg-muted text-muted-foreground"
                  )}
                >
                  {conversation.status === 'open' && 'Aberto'}
                  {conversation.status === 'resolved' && 'Resolvido'}
                  {conversation.status === 'archived' && 'Arquivado'}
                </span>
              )}
            </div>

            {/* Line 5: Contact Tags */}
            {(() => {
              const contactTagIds = allContactTags?.filter(ct => ct.contact_id === conversation.contact?.id).map(ct => ct.tag_id) || [];
              const contactTags = tags.filter(t => contactTagIds.includes(t.id));
              if (contactTags.length === 0) return null;
              const visibleTags = contactTags.slice(0, 2);
              const hiddenTags = contactTags.slice(2);
              return (
                <div className="flex items-center gap-1 mt-1 overflow-hidden">
                  {visibleTags.map(tag => (
                    <span
                      key={tag.id}
                      className="text-[9px] px-1.5 py-0.5 rounded truncate max-w-[80px]"
                      style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                  {hiddenTags.length > 0 && (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground cursor-default">
                            +{hiddenTags.length}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px]">
                          <div className="flex flex-wrap gap-1">
                            {hiddenTags.map(tag => (
                              <span
                                key={tag.id}
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  };

  // Check if user should see unassigned column for this pipeline
  const isAdminOrOwner = userRole === 'owner' || userRole === 'admin';
  const hideUnassignedIds = (userPermissions as any)?.hide_unassigned_pipeline_ids || [];

  const shouldHideUnassigned = isAdminOrOwner 
    ? adminHideUnassigned 
    : (pipeline?.id && hideUnassignedIds.includes(pipeline.id));

  // Check if dragging over unassigned column
  const isDragOverUnassigned = dragOverColumn === 'unassigned';

  return (
    <div
      ref={scrollContainerRef}
      className={cn(
        "flex gap-4 h-[calc(100vh-140px)]",
        isMobile ? "select-auto overflow-x-auto overflow-y-hidden" : "select-none cursor-grab overflow-x-auto overflow-y-hidden"
      )}
      style={{
        touchAction: isMobile ? 'pan-x pan-y' : 'pan-y',
        WebkitOverflowScrolling: 'touch',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onDragOver={(e) => {
        e.preventDefault();
        // Auto-scroll horizontally when dragging near edges (for the whole container)
        const container = scrollContainerRef.current;
        if (container && draggedCard) {
          const rect = container.getBoundingClientRect();
          const scrollSpeed = 15;
          const edgeThreshold = 80;

          if (e.clientX < rect.left + edgeThreshold) {
            container.scrollLeft -= scrollSpeed;
          } else if (e.clientX > rect.right - edgeThreshold) {
            container.scrollLeft += scrollSpeed;
          }
        }
      }}
    >
      {/* Admin toggle to show hidden unassigned column */}
      {isAdminOrOwner && shouldHideUnassigned && unassignedConversations.length > 0 && (
        <div className="flex flex-col items-center justify-start pt-4 min-w-[48px]">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={toggleAdminHideUnassigned}
                >
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Mostrar não classificados ({unassignedConversations.length})
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {/* Unassigned column - show when allowed and there are items OR when dragging */}
      {!shouldHideUnassigned && (unassignedConversations.length > 0 || draggedCard) && (
        <div
          className={cn(
            "pipeline-column border-dashed transition-all duration-300",
            isDragOverUnassigned && "bg-muted/40 scale-[1.01]"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOverColumn('unassigned'); }}
          onDragLeave={() => setDragOverColumn(null)}
          onDrop={(e) => handleDrop(e, null)}
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-muted" />
              <h3 className="font-semibold text-muted-foreground text-sm">Não classificados</h3>
              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                {unassignedConversations.length}
              </span>
            </div>
            {isAdminOrOwner && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={toggleAdminHideUnassigned}
                    >
                      <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Ocultar não classificados</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="space-y-2 min-h-[200px] overflow-y-auto flex-1" style={{ WebkitOverflowScrolling: 'touch' }}>
            {unassignedConversations.map(renderConversationCard)}
          </div>
        </div>
      )}

      {/* Pipeline columns */}
      {columns.map((column) => {
        const columnConversations = getConversationsByColumn(column.id);
        const isDragOver = dragOverColumn === column.id;

        return (
          <div
            key={column.id}
            className={cn(
              "pipeline-column transition-all duration-300 border-l-4",
              isDragOver && "scale-[1.01]"
            )}
            style={{
              borderLeftColor: column.color,
              ...(isDragOver ? { boxShadow: `inset 0 0 20px ${column.color}15, 0 0 0 1px ${column.color}40` } : {}),
            }}
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <div
              className="flex items-center justify-between mb-3 px-2 py-1.5 -mx-3 -mt-3 rounded-t-xl"
              style={{ backgroundColor: `${column.color}15` }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: column.color }}
                />
                <h3 className="font-semibold text-foreground text-sm">{column.name}</h3>
                <span
                  className="flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: column.color }}
                >
                  {columnConversations.length}
                </span>
              </div>
            </div>

            <div className="space-y-2 min-h-[200px] overflow-y-auto flex-1" style={{ WebkitOverflowScrolling: 'touch' }}>
              {columnConversations.map(renderConversationCard)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
