import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useConversations, DbConversation } from '@/hooks/useConversations';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isWithinInterval, parseISO } from 'date-fns';
import {
  GripVertical,
  Loader2,
  Inbox,
  MessageCircle,
  Bot,
  Check,
  CheckCheck,
  EyeOff,
  Eye,
  RefreshCw,
  StickyNote,
  ListTodo,
  Paperclip,
  MessagesSquare,
  X,
  Save,
  Phone,
  CalendarDays,
  AlignLeft,
  Palette,
  Tags as TagsIcon,
  Settings,
  Image as ImageIcon,
  Plus,
  Trash2,
  CheckSquare,
  FileSignature,
  Pencil,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConversationCardActions } from '@/components/conversations/ConversationCardActions';
import { cn } from '@/lib/utils';
import { highlightTerm } from '@/lib/highlightTerm';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Pipeline,
  usePipelineColumns,
  useConversationPositions,
  useMoveConversation
} from '@/hooks/usePipelines';
import { usePipelineRealtime } from '@/hooks/usePipelineRealtime';
import { ConversationFiltersState } from '@/components/shared/ConversationFilters';
import { useUserPermissions, useCurrentUserRole } from '@/hooks/useUserPermissions';
import { useAuth } from '@/hooks/useAuth';
import { useTags } from '@/hooks/useTags';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFollowUpStatus } from '@/hooks/useFollowUpStatus';
import { useMessageSearch } from '@/hooks/useMessageSearch';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ContactFilesSection } from '@/components/conversations/ContactFilesSection';
import { ContactContractsSection } from '@/components/conversations/ContactContractsSection';
import { ContactNotesSection } from '@/components/conversations/ContactNotesSection';
import { ContactLogsSection } from '@/components/conversations/ContactLogsSection';
import { ContactAvatar } from '@/components/conversations/ContactAvatar';
import { useToast } from '@/hooks/use-toast';

interface PipelineBoardProps {
  pipeline: Pipeline | null;
  filters: ConversationFiltersState;
  searchQuery?: string;
  onConversationClick: (conversation: DbConversation) => void;
  sharedConversationIds?: Set<string>;
}

type TagDisplayMode = 'labels' | 'bars';
type CardPanelTab = 'details' | 'files' | 'contracts' | 'notes' | 'activity' | 'checklist';
type CardSideTab = 'comments' | 'logs';
type ChecklistItem = { id: string; text: string; done: boolean };
type ChecklistTemplate = { id: string; name: string; workspaceId: string | null; items: ChecklistItem[] };
type CardChecklist = { id: string; templateId: string | null; name: string; items: ChecklistItem[] };

const CONTACT_COUNT_BATCH_SIZE = 75;

async function fetchContactRowCounts(
  table: 'contact_files' | 'contact_notes',
  contactIds: string[],
) {
  const counts = new Map<string, number>();

  for (let index = 0; index < contactIds.length; index += CONTACT_COUNT_BATCH_SIZE) {
    const batch = contactIds.slice(index, index + CONTACT_COUNT_BATCH_SIZE);
    const { data, error } = await supabase
      .from(table)
      .select('contact_id')
      .in('contact_id', batch);

    if (error) throw error;
    (data || []).forEach((row) => {
      counts.set(row.contact_id, (counts.get(row.contact_id) || 0) + 1);
    });
  }

  return counts;
}

const BOARD_BACKGROUNDS = [
  '#9b3f6d',
  '#2563eb',
  '#0f766e',
  '#7c3aed',
  '#475569',
  '#166534',
  '#b45309',
  '#1f2937',
];

const BOARD_BACKGROUND_IMAGES = [
  {
    name: 'Montanhas',
    url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Cidade',
    url: 'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Floresta',
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Abstrato',
    url: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Escritorio',
    url: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Mesa',
    url: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Noite',
    url: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Vidro',
    url: 'https://images.unsplash.com/photo-1497366412874-3415097a27e7?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Oceano',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80',
  },
  {
    name: 'Textura',
    url: 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=1600&q=80',
  },
];

function CardMetric({
  icon: Icon,
  count,
  label,
  onClick,
}: {
  icon: typeof StickyNote;
  count: number;
  label: string;
  onClick?: (event: React.MouseEvent) => void;
}) {
  return (
    <button type="button" className="inline-flex items-center gap-1 hover:text-zinc-100" title={label} onClick={onClick}>
      <Icon className="h-3.5 w-3.5" />
      <span>{count}</span>
    </button>
  );
}

const getChecklistTemplateStorageKey = (workspaceId?: string | null) => `pipeline_checklist_templates:${workspaceId || 'global'}`;
const getColumnChecklistStorageKey = (workspaceId?: string | null, pipelineId?: string | null) => (
  `pipeline_column_checklists:${workspaceId || 'global'}:${pipelineId || 'none'}`
);
const getBoardBackgroundStorageKey = (workspaceId?: string | null) => `pipeline_board_background:${workspaceId || 'global'}`;
const getBoardBackgroundImageStorageKey = (workspaceId?: string | null) => `pipeline_board_background_image:${workspaceId || 'global'}`;

const getPipelineBoardBackground = (pipeline?: Pipeline | null, workspaceId?: string | null) => (
  pipeline?.board_background_color ||
  localStorage.getItem(getBoardBackgroundStorageKey(workspaceId)) ||
  BOARD_BACKGROUNDS[0]
);

const getPipelineBoardBackgroundImage = (pipeline?: Pipeline | null, workspaceId?: string | null) => (
  pipeline?.board_background_image ||
  localStorage.getItem(getBoardBackgroundImageStorageKey(workspaceId)) ||
  ''
);

function loadChecklistTemplates(workspaceId?: string | null): ChecklistTemplate[] {
  try {
    const stored = JSON.parse(localStorage.getItem(getChecklistTemplateStorageKey(workspaceId)) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.map((template: any) => ({
      ...template,
      workspaceId: template.workspaceId || workspaceId || null,
      items: Array.isArray(template.items)
        ? template.items.map((item: any) => ({
            id: item.id || crypto.randomUUID(),
            text: item.text || '',
            done: !!item.done,
          }))
        : [],
    }));
  } catch {
    return [];
  }
}

function loadColumnChecklistConfig(workspaceId?: string | null, pipelineId?: string | null): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(getColumnChecklistStorageKey(workspaceId, pipelineId)) || '{}');
  } catch {
    return {};
  }
}

function buildChecklistFromTemplate(template: ChecklistTemplate, existing: ChecklistItem[] = []) {
  return template.items.map(templateItem => {
    const current = existing.find(item => item.id === templateItem.id || item.text === templateItem.text);
    return {
      id: templateItem.id || crypto.randomUUID(),
      text: templateItem.text,
      done: current?.done || false,
    };
  });
}

function getCardChecklists(conversation: DbConversation): CardChecklist[] {
  const stored = (conversation.metadata as any)?.pipeline_checklists;
  if (Array.isArray(stored) && stored.length > 0) return stored as CardChecklist[];
  // Legacy fallback: migrate from single pipeline_checklist
  const legacyItems = ((conversation.metadata as any)?.pipeline_checklist || []) as ChecklistItem[];
  const legacyTemplateId = ((conversation.metadata as any)?.pipeline_checklist_template_id as string | null) || null;
  if (legacyItems.length > 0) {
    return [{ id: 'legacy', templateId: legacyTemplateId, name: 'Checklist', items: legacyItems }];
  }
  return [];
}

export function PipelineBoard({ pipeline, filters, searchQuery = '', onConversationClick, sharedConversationIds }: PipelineBoardProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedWorkspace, selectedWorkspaceId, isAdmin } = useWorkspaceContext();
  const { data: conversations, isLoading: conversationsLoading } = useConversations();
  const { data: columns = [], isLoading: columnsLoading } = usePipelineColumns(pipeline?.id || null);
  const { data: positions = [] } = useConversationPositions(pipeline?.id || null);
  const moveConversation = useMoveConversation();
  const { data: userPermissions } = useUserPermissions();
  const { data: userRole } = useCurrentUserRole();
  const { user } = useAuth();
  const { data: tags = [] } = useTags();
  const { data: followUpMap } = useFollowUpStatus();
  const { data: messageSearchResult } = useMessageSearch(searchQuery);
  usePipelineRealtime(pipeline?.id || null);

  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [dragOverCard, setDragOverCard] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<DbConversation | null>(null);
  const [selectedCardTab, setSelectedCardTab] = useState<CardPanelTab>('details');
  const [expandedChecklistCardId, setExpandedChecklistCardId] = useState<string | null>(null);
  const [showAllChecklistCardId, setShowAllChecklistCardId] = useState<string | null>(null);
  const [tagDisplayMode, setTagDisplayMode] = useState<TagDisplayMode>(() => {
    const stored = localStorage.getItem('pipeline_tag_display_mode');
    return stored === 'bars' ? 'bars' : 'labels';
  });
  const [boardBackground, setBoardBackground] = useState(() => getPipelineBoardBackground(pipeline, selectedWorkspaceId));
  const [boardBackgroundImage, setBoardBackgroundImage] = useState(() => getPipelineBoardBackgroundImage(pipeline, selectedWorkspaceId));
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>(() => loadChecklistTemplates(selectedWorkspaceId));
  const [columnChecklistConfig, setColumnChecklistConfig] = useState<Record<string, string>>(() => (
    loadColumnChecklistConfig(selectedWorkspaceId, pipeline?.id)
  ));

  const toggleTagDisplayMode = useCallback(() => {
    setTagDisplayMode(prev => {
      const next = prev === 'labels' ? 'bars' : 'labels';
      localStorage.setItem('pipeline_tag_display_mode', next);
      return next;
    });
  }, []);

  const persistBoardBackground = useCallback(async (patch: Partial<Pick<Pipeline, 'board_background_color' | 'board_background_image'>>) => {
    if (!pipeline?.id) return;

    queryClient.setQueryData(['pipelines'], (old: Pipeline[] | undefined) => (
      Array.isArray(old)
        ? old.map(item => item.id === pipeline.id ? { ...item, ...patch } : item)
        : old
    ));

    const { error } = await supabase
      .from('pipelines')
      .update(patch as any)
      .eq('id', pipeline.id);

    if (error) {
      toast({
        title: 'Erro ao salvar fundo',
        description: error.message,
        variant: 'destructive',
      });
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['pipelines'] });
  }, [pipeline?.id, queryClient, toast]);

  const changeBoardBackground = useCallback((color: string) => {
    setBoardBackground(color);
    setBoardBackgroundImage('');
    localStorage.setItem(getBoardBackgroundStorageKey(selectedWorkspaceId), color);
    localStorage.removeItem(getBoardBackgroundImageStorageKey(selectedWorkspaceId));
    void persistBoardBackground({
      board_background_color: color,
      board_background_image: null,
    });
  }, [persistBoardBackground, selectedWorkspaceId]);

  const changeBoardBackgroundImage = useCallback((url: string) => {
    setBoardBackgroundImage(url);
    localStorage.setItem(getBoardBackgroundImageStorageKey(selectedWorkspaceId), url);
    void persistBoardBackground({
      board_background_color: boardBackground,
      board_background_image: url || null,
    });
  }, [boardBackground, persistBoardBackground, selectedWorkspaceId]);

  useEffect(() => {
    setChecklistTemplates(loadChecklistTemplates(selectedWorkspaceId));
    setColumnChecklistConfig(loadColumnChecklistConfig(selectedWorkspaceId, pipeline?.id));
  }, [selectedWorkspaceId, pipeline?.id]);

  useEffect(() => {
    setBoardBackground(getPipelineBoardBackground(pipeline, selectedWorkspaceId));
    setBoardBackgroundImage(getPipelineBoardBackgroundImage(pipeline, selectedWorkspaceId));
  }, [pipeline?.id, pipeline?.board_background_color, pipeline?.board_background_image, selectedWorkspaceId]);



  // Ultra-lightweight Trello-style horizontal pan (no React state during pan = zero lag)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pan = useRef({ active: false, lastX: 0, vel: 0, lastT: 0, moved: false, acc: 0, pid: -1 });
  const rafId = useRef<number | null>(null);
  // Pointer-events based card drag (replaces HTML5 drag which conflicts with pan)
  const cardDrag = useRef<{
    active: boolean;
    cardId: string;
    startX: number;
    startY: number;
    moved: boolean;
    overlayEl: HTMLDivElement | null;
    pid: number;
  }>({ active: false, cardId: '', startX: 0, startY: 0, moved: false, overlayEl: null, pid: -1 });
  // Ref to always-fresh performDrop to avoid stale closures in useCallback
  const performDropRef = useRef<(movedId: string, colId: string | null, targetCardId?: string | null) => Promise<void>>(async () => {});

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
    if (draggedCard || cardDrag.current.active) return;
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
      // === SHARED-ONLY PIPELINE: only show shared conversations ===
      if (sharedConversationIds && !sharedConversationIds.has(conv.id)) return false;

      // === PERMISSION-BASED FILTER (same rule as Conversations) ===
      const isRestricted = userRole && userRole !== 'owner' && userRole !== 'admin';
      const filterType = userPermissions?.conversations_filter_type || 'all';
      if (isRestricted && filterType !== 'all') {
        const isAssigned = conv.assigned_to === user?.id;
        const allowedTags = userPermissions?.conversations_allowed_tags || [];
        const contactTagIds = allContactTags
          ?.filter(ct => ct.contact_id === conv.contact?.id)
          .map(ct => ct.tag_id) || [];
        const hasAllowedTag = allowedTags.length > 0 && allowedTags.some(tagId => contactTagIds.includes(tagId));

        if (filterType === 'assigned' && !isAssigned) return false;
        if (filterType === 'tags' && !hasAllowedTag) return false;
        if (filterType === 'assigned_and_tags' && !isAssigned && !hasAllowedTag) return false;
      }

      // === WORKSPACE FILTER (must come first) ===
      // Never use tags as workspace boundaries. Tags can be shared or misapplied.
      if (selectedWorkspaceId && selectedWorkspace) {
        const hasDirectWorkspace = (conv as any).workspace_id === selectedWorkspaceId;
        if (!hasDirectWorkspace) return false;
      }

      // Search filter (name, phone, or message content)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const name = conv.contact?.name?.toLowerCase() || '';
        const phone = conv.contact?.phone || '';
        const matchesNameOrPhone = name.includes(query) || phone.includes(query);
        const matchesMessage = messageSearchResult?.matchIds?.has(conv.id) ?? false;
        if (!matchesNameOrPhone && !matchesMessage) return false;
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
  }, [conversations, filters, searchQuery, allContactTags, selectedWorkspaceId, selectedWorkspace, messageSearchResult, sharedConversationIds, userRole, userPermissions, user?.id]);

  const filteredContactIds = useMemo(() => (
    Array.from(new Set(filteredConversations.map(conv => conv.contact?.id).filter(Boolean) as string[]))
  ), [filteredConversations]);

  const { data: contactFileCounts = new Map<string, number>() } = useQuery({
    queryKey: ['pipeline-contact-file-counts', filteredContactIds],
    queryFn: async () => {
      if (filteredContactIds.length === 0) return new Map<string, number>();
      return fetchContactRowCounts('contact_files', filteredContactIds);
    },
    enabled: filteredContactIds.length > 0,
  });

  const { data: contactNoteCounts = new Map<string, number>() } = useQuery({
    queryKey: ['pipeline-contact-note-counts', filteredContactIds],
    queryFn: async () => {
      if (filteredContactIds.length === 0) return new Map<string, number>();
      return fetchContactRowCounts('contact_notes', filteredContactIds);
    },
    enabled: filteredContactIds.length > 0,
  });

  // Map conversations to columns
  const getConversationsByColumn = (columnId: string) => {
    const positionMap = new Map(positions.map(p => [p.conversation_id, p.column_id]));
    const orderMap = new Map(positions.map(p => [p.conversation_id, Number(p.order || 0)]));
    return filteredConversations
      .filter(c => positionMap.get(c.id) === columnId)
      .sort((a, b) => {
        const byOrder = (orderMap.get(a.id) || 0) - (orderMap.get(b.id) || 0);
        if (byOrder !== 0) return byOrder;
        return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();
      });
  };

  // Get unassigned conversations (not in any column of this pipeline)
  const unassignedConversations = useMemo(() => {
    const assignedIds = new Set(positions.map(p => p.conversation_id));
    return filteredConversations.filter(c => !assignedIds.has(c.id));
  }, [filteredConversations, positions]);

  // ─── Pointer-events drag (replaces HTML5 drag to avoid conflicts with pan) ───
  const startCardDrag = useCallback((e: React.PointerEvent, conversationId: string, cardEl: HTMLElement) => {
    if (e.button !== 0 || e.pointerType !== 'mouse') return;
    // Don't drag from interactive children
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, textarea, select, [role="button"], label')) return;
    e.preventDefault();
    e.stopPropagation();
    cardEl.setPointerCapture(e.pointerId);
    cardDrag.current = {
      active: true,
      cardId: conversationId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      overlayEl: null,
      pid: e.pointerId,
    };
  }, []);

  const onCardPointerMove = useCallback((e: React.PointerEvent) => {
    const cd = cardDrag.current;
    if (!cd.active || cd.pid !== e.pointerId) return;
    const dx = e.clientX - cd.startX;
    const dy = e.clientY - cd.startY;
    if (!cd.moved && Math.sqrt(dx * dx + dy * dy) < 5) return;
    if (!cd.moved) {
      cd.moved = true;
      setDraggedCard(cd.cardId);
      // Create visual overlay clone
      const srcEl = document.querySelector(`[data-card-id="${cd.cardId}"]`) as HTMLElement | null;
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;opacity:0.85;transform:rotate(2deg);transition:none;box-shadow:0 20px 40px rgba(0,0,0,0.5);';
      if (srcEl) {
        const rect = srcEl.getBoundingClientRect();
        overlay.style.width = rect.width + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.top = rect.top + 'px';
        overlay.innerHTML = srcEl.outerHTML;
        // Remove event listeners from clone
        const clone = overlay.firstElementChild as HTMLElement | null;
        if (clone) { clone.style.cursor = 'grabbing'; clone.style.margin = '0'; }
      }
      document.body.appendChild(overlay);
      cd.overlayEl = overlay;
    }
    if (cd.overlayEl) {
      const overlay = cd.overlayEl;
      const srcEl = document.querySelector(`[data-card-id="${cd.cardId}"]`) as HTMLElement | null;
      if (srcEl) {
        const rect = srcEl.getBoundingClientRect();
        overlay.style.left = (e.clientX - rect.width / 2) + 'px';
        overlay.style.top = (e.clientY - 20) + 'px';
      } else {
        overlay.style.left = (e.clientX + 10) + 'px';
        overlay.style.top = (e.clientY + 10) + 'px';
      }
    }
    // Highlight drop target column by horizontal proximity
    const container = scrollContainerRef.current;
    let colId: string | null = null;
    let hoverCardId: string | null = null;

    if (container) {
      const containerRect = container.getBoundingClientRect();
      const isInsideContainer = (
        e.clientX >= containerRect.left &&
        e.clientX <= containerRect.right &&
        e.clientY >= containerRect.top &&
        e.clientY <= containerRect.bottom
      );

      if (isInsideContainer) {
        const columnsEls = container.querySelectorAll('[data-column-id]');
        let targetColEl: HTMLElement | null = null;
        let closestDist = Infinity;

        for (let i = 0; i < columnsEls.length; i++) {
          const colEl = columnsEls[i] as HTMLElement;
          const rect = colEl.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right) {
            targetColEl = colEl;
            break;
          }
          const dist = Math.min(Math.abs(e.clientX - rect.left), Math.abs(e.clientX - rect.right));
          if (dist < closestDist) {
            closestDist = dist;
            targetColEl = colEl;
          }
        }
        colId = targetColEl?.dataset.columnId || null;

        const el = document.elementFromPoint(e.clientX, e.clientY);
        const cardEl = el?.closest('[data-card-id]') as HTMLElement | null;
        hoverCardId = cardEl?.dataset.cardId || null;
      }
    }

    setDragOverColumn(colId);
    setDragOverCard(hoverCardId !== cd.cardId ? hoverCardId : null);
  }, []);

  const onCardPointerUp = useCallback(async (e: React.PointerEvent) => {
    const cd = cardDrag.current;
    if (!cd.active || cd.pid !== e.pointerId) return;
    const wasMoved = cd.moved;
    const cardId = cd.cardId;
    // Cleanup overlay
    if (cd.overlayEl && document.body.contains(cd.overlayEl)) document.body.removeChild(cd.overlayEl);
    cardDrag.current = { active: false, cardId: '', startX: 0, startY: 0, moved: false, overlayEl: null, pid: -1 };
    if (!wasMoved) {
      setDraggedCard(null);
      setDragOverColumn(null);
      setDragOverCard(null);
      return;
    }
    
    // Determine drop target column
    const container = scrollContainerRef.current;
    let colId: string | null = null;
    let targetCardId: string | null = null;
    let shouldPerformDrop = false;

    if (container) {
      const containerRect = container.getBoundingClientRect();
      const isInsideContainer = (
        e.clientX >= containerRect.left &&
        e.clientX <= containerRect.right &&
        e.clientY >= containerRect.top &&
        e.clientY <= containerRect.bottom
      );

      if (isInsideContainer) {
        shouldPerformDrop = true;
        const columnsEls = container.querySelectorAll('[data-column-id]');
        let targetColEl: HTMLElement | null = null;
        let closestDist = Infinity;

        for (let i = 0; i < columnsEls.length; i++) {
          const colEl = columnsEls[i] as HTMLElement;
          const rect = colEl.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right) {
            targetColEl = colEl;
            break;
          }
          const dist = Math.min(Math.abs(e.clientX - rect.left), Math.abs(e.clientX - rect.right));
          if (dist < closestDist) {
            closestDist = dist;
            targetColEl = colEl;
          }
        }
        colId = targetColEl?.dataset.columnId || null;

        const el = document.elementFromPoint(e.clientX, e.clientY);
        const targetCardEl = el?.closest('[data-card-id]') as HTMLElement | null;
        targetCardId = targetCardEl?.dataset.cardId !== cardId ? (targetCardEl?.dataset.cardId || null) : null;
      }
    }

    if (shouldPerformDrop && colId !== null) {
      const columnId = colId === 'unassigned' ? null : colId;
      await performDropRef.current(cardId, columnId, targetCardId);
    } else {
      // Cancel drop: reset drag states
      setDraggedCard(null);
      setDragOverColumn(null);
      setDragOverCard(null);
    }
  }, []);

  const handleDragStart = (e: React.DragEvent, conversationId: string) => {
    // Legacy fallback — not used with pointer drag
    setDraggedCard(conversationId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', conversationId);
  };

  const saveChecklistsForConversation = useCallback(async (conversation: DbConversation, checklists: CardChecklist[]) => {
    const currentMetadata = (conversation.metadata as Record<string, unknown>) || {};
    const metadata = { ...currentMetadata, pipeline_checklists: checklists };
    const optimisticConversation = { ...conversation, metadata } as DbConversation;

    queryClient.setQueriesData({ queryKey: ['conversations'] }, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map(item => item.id === conversation.id ? optimisticConversation : item);
    });
    setSelectedCard(prev => prev?.id === conversation.id ? optimisticConversation : prev);

    const { error } = await supabase
      .from('conversations')
      .update({ metadata: metadata as any })
      .eq('id', conversation.id);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['pipeline-conversations'] });
  }, [queryClient]);

  // Backward-compatible single-checklist save (used for mini-card inline toggle)
  const saveChecklistForConversation = useCallback(async (conversation: DbConversation, items: ChecklistItem[], templateId?: string | null) => {
    const current = getCardChecklists(conversation);
    const next: CardChecklist[] = current.length > 0
      ? current.map((cl, i) => i === 0 ? { ...cl, items } : cl)
      : [{ id: crypto.randomUUID(), templateId: templateId || null, name: 'Checklist', items }];
    await saveChecklistsForConversation(conversation, next);
  }, [saveChecklistsForConversation]);

  const applyColumnChecklistTemplate = useCallback(async (conversationId: string, columnId: string) => {
    // Always read config fresh from localStorage to avoid stale closures
    const freshConfig = loadColumnChecklistConfig(selectedWorkspaceId, pipeline?.id);
    const templateId = freshConfig[columnId];
    if (!templateId) return;
    // Read templates fresh from localStorage too
    const freshTemplates = loadChecklistTemplates(selectedWorkspaceId);
    const template = freshTemplates.find(item => item.id === templateId);
    if (!template) return;
    // Get the freshest version of the conversation from React Query cache
    let conversation: DbConversation | undefined;
    const allCaches = queryClient.getQueriesData<DbConversation[]>({ queryKey: ['conversations'] });
    for (const [, data] of allCaches) {
      if (Array.isArray(data)) {
        const found = data.find(item => item.id === conversationId);
        if (found) { conversation = found; break; }
      }
    }
    if (!conversation) {
      conversation = conversations?.find(item => item.id === conversationId);
    }
    if (!conversation) return;
    const currentChecklists = getCardChecklists(conversation);
    // Don't add if already has a checklist from this template
    if (currentChecklists.some(cl => cl.templateId === template.id)) return;
    const newChecklist: CardChecklist = {
      id: crypto.randomUUID(),
      templateId: template.id,
      name: template.name,
      items: buildChecklistFromTemplate(template, []),
    };
    await saveChecklistsForConversation(conversation, [...currentChecklists, newChecklist]);
  }, [columnChecklistConfig, conversations, queryClient, saveChecklistsForConversation, selectedWorkspaceId, pipeline?.id]);

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColumn(columnId);
    // Clear card highlight when hovering column area directly
    setDragOverCard(null);

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

  const getDropIndex = useCallback((columnId: string, targetConversationId?: string | null) => {
    const orderedPositions = positions
      .filter(position => position.column_id === columnId && position.conversation_id !== draggedCard)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    if (!targetConversationId) {
      return orderedPositions.length;
    }

    const targetIndex = orderedPositions.findIndex(position => position.conversation_id === targetConversationId);
    if (targetIndex === -1) return orderedPositions.length;
    return targetIndex;
  }, [draggedCard, positions]);

  const normalizeColumnOrder = useCallback(async (columnId: string, movedConversationId: string, targetIndex: number) => {
    const orderedPositions = positions
      .filter(position => position.column_id === columnId && position.conversation_id !== movedConversationId)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

    const boundedIndex = Math.max(0, Math.min(targetIndex, orderedPositions.length));
    const reordered = [...orderedPositions];
    reordered.splice(boundedIndex, 0, {
      id: '',
      conversation_id: movedConversationId,
      pipeline_id: pipeline?.id || '',
      column_id: columnId,
      order: boundedIndex,
      created_at: '',
      updated_at: '',
    });

    const results = await Promise.all(reordered.map((position, index) => (
      supabase
        .from('conversation_pipeline_positions')
        .update({ order: index, updated_at: new Date().toISOString() })
        .eq('conversation_id', position.conversation_id)
        .eq('pipeline_id', pipeline?.id || '')
    )));
    const failed = results.find(result => result.error);
    if (failed?.error) throw failed.error;

    queryClient.invalidateQueries({ queryKey: ['conversation-positions', pipeline?.id] });
    queryClient.invalidateQueries({ queryKey: ['conversation-positions'] });
  }, [pipeline?.id, positions, queryClient]);

  const handleDrop = async (e: React.DragEvent, columnId: string | null, targetConversationId?: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    const movedConversationId = draggedCard || e.dataTransfer.getData('text/plain');
    await performDrop(movedConversationId || '', columnId, targetConversationId);
  };

  const performDrop = async (movedConversationId: string, columnId: string | null, targetConversationId?: string | null) => {
    const previousPositions = pipeline
      ? queryClient.getQueryData<typeof positions>(['conversation-positions', pipeline.id]) || positions
      : positions;

    try {
      if (movedConversationId && pipeline) {
        if (columnId === null) {
          const existing = positions.find(position => position.conversation_id === movedConversationId);
          const withoutMoved = positions.filter(position => position.conversation_id !== movedConversationId);
          const nextPositions = existing?.column_id
            ? withoutMoved.map(position => position.column_id === existing.column_id
              ? {
                  ...position,
                  order: withoutMoved
                    .filter(item => item.column_id === existing.column_id)
                    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
                    .findIndex(item => item.conversation_id === position.conversation_id),
                }
              : position)
            : withoutMoved;
          queryClient.setQueryData(['conversation-positions', pipeline.id], nextPositions);
          setDraggedCard(null);
          setDragOverColumn(null);
          setDragOverCard(null);

          // Remove from pipeline (move to unassigned)
          await supabase
            .from('conversation_pipeline_positions')
            .delete()
            .eq('conversation_id', movedConversationId)
            .eq('pipeline_id', pipeline.id);
          // Invalidate positions query to refresh UI
          queryClient.invalidateQueries({ queryKey: ['conversation-positions', pipeline.id] });
          queryClient.invalidateQueries({ queryKey: ['conversation-positions'] });
        } else {
          const order = getDropIndex(columnId, targetConversationId);
          const existing = positions.find(position => position.conversation_id === movedConversationId);
          const withoutMoved = positions.filter(position => position.conversation_id !== movedConversationId);
          const targetPositions = withoutMoved
            .filter(position => position.column_id === columnId)
            .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
          const movedPosition = existing || {
            id: `optimistic-${movedConversationId}`,
            conversation_id: movedConversationId,
            pipeline_id: pipeline.id,
            column_id: columnId,
            order,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          const reorderedTarget = [...targetPositions];
          reorderedTarget.splice(Math.max(0, Math.min(order, reorderedTarget.length)), 0, {
            ...movedPosition,
            pipeline_id: pipeline.id,
            column_id: columnId,
          });
          const reindexedTarget = reorderedTarget.map((position, index) => ({ ...position, order: index }));
          const sourceColumnPositions = existing?.column_id && existing.column_id !== columnId
            ? withoutMoved
                .filter(position => position.column_id === existing.column_id)
                .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
                .map((position, index) => ({ ...position, order: index }))
            : [];
          const optimisticIds = new Set([
            ...reindexedTarget.map(position => position.conversation_id),
            ...sourceColumnPositions.map(position => position.conversation_id),
          ]);
          queryClient.setQueryData(['conversation-positions', pipeline.id], [
            ...withoutMoved.filter(position => !optimisticIds.has(position.conversation_id)),
            ...sourceColumnPositions,
            ...reindexedTarget,
          ]);
          setDraggedCard(null);
          setDragOverColumn(null);
          setDragOverCard(null);

          const result = await moveConversation.mutateAsync({
            conversationId: movedConversationId,
            pipelineId: pipeline.id,
            columnId,
            order,
            skipInvalidate: true,
          });
          await normalizeColumnOrder(columnId, movedConversationId, order);
          // Apply column checklist template whenever the card lands in a different column
          const previousColumnId = existing?.column_id;
          if (!previousColumnId || previousColumnId !== columnId) {
            await applyColumnChecklistTemplate(movedConversationId, columnId);
          }
        }
      }
    } catch (error) {
      if (pipeline) {
        queryClient.setQueryData(['conversation-positions', pipeline.id], previousPositions);
      }
      console.error('[PipelineBoard] Failed to move card:', error);
      toast({
        title: 'Erro ao mover card',
        description: error instanceof Error ? error.message : 'Nao foi possivel salvar a nova posicao.',
        variant: 'destructive',
      });
    }
    setDraggedCard(null);
    setDragOverColumn(null);
    setDragOverCard(null);
  };
  // Keep ref always pointing to latest performDrop (avoids stale closure in onCardPointerUp useCallback)
  performDropRef.current = performDrop;

  const handleMoveCardFromPanel = useCallback(async (conversation: DbConversation, columnId: string) => {
    if (!pipeline) return;
    await moveConversation.mutateAsync({
      conversationId: conversation.id,
      pipelineId: pipeline.id,
      columnId,
    });
    await applyColumnChecklistTemplate(conversation.id, columnId);
  }, [applyColumnChecklistTemplate, moveConversation, pipeline]);

  const handleDragEnd = () => {
    setDraggedCard(null);
    setDragOverColumn(null);
    setDragOverCard(null);
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

  const getPresenceLabel = (isOnline: boolean, isTyping: boolean, isRecording: boolean) => {
    if (isTyping) return 'digitando';
    if (isRecording) return 'gravando audio';
    return isOnline ? 'online' : 'offline';
  };

  const renderMessageStatus = (lastMessage: NonNullable<DbConversation['last_message']>[number]) => {
    if (lastMessage.read_at) {
      return <CheckCheck className="text-[#53bdeb] h-3 w-3 stroke-[3]" />;
    }
    if (lastMessage.delivered_at) {
      return <CheckCheck className="text-muted-foreground/70 h-3 w-3 stroke-[3]" />;
    }
    return <Check className="text-muted-foreground/70 h-3 w-3 stroke-[3]" />;
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
    // Real presence logic using contact_presence table
    const presenceData = conversation.contact?.contact_presence;
    const presence = Array.isArray(presenceData) ? presenceData[0] : presenceData;
    const isActive = presence ? new Date(presence.expires_at) > new Date() : false;
    const isOnline = isActive && presence?.presence_type !== 'offline';
    const isTyping = isActive && presence?.presence_type === 'typing';
    const isRecording = isActive && presence?.presence_type === 'recording';
    const contactId = conversation.contact?.id;
    const note = (conversation.contact?.metadata as { note?: string } | null)?.note;
    const contactTagIds = allContactTags?.filter(ct => ct.contact_id === contactId).map(ct => ct.tag_id) || [];
    const contactTags = tags.filter(t => contactTagIds.includes(t.id));
    const visibleTags = contactTags.slice(0, 5);
    const fileCount = contactId ? contactFileCounts.get(contactId) || 0 : 0;
    const noteCount = contactId ? contactNoteCounts.get(contactId) || 0 : 0;
    const cardChecklists = getCardChecklists(conversation);
    const checklistItems = cardChecklists.flatMap(cl => cl.items);
    const taskCount = checklistItems.length;
    const doneTaskCount = checklistItems.filter(item => item.done).length;
    const cardPosition = positions.find(position => position.conversation_id === conversation.id);
    const isCardDropTarget = dragOverCard === conversation.id && draggedCard !== conversation.id;

    return (
      <div
        key={conversation.id}
        data-card-id={conversation.id}
        onPointerDown={(e) => {
          const el = e.currentTarget;
          startCardDrag(e, conversation.id, el);
        }}
        onPointerMove={onCardPointerMove}
        onPointerUp={onCardPointerUp}
        onPointerCancel={() => {
          const cd = cardDrag.current;
          if (cd.overlayEl && document.body.contains(cd.overlayEl)) document.body.removeChild(cd.overlayEl);
          cardDrag.current = { active: false, cardId: '', startX: 0, startY: 0, moved: false, overlayEl: null, pid: -1 };
          setDraggedCard(null); setDragOverColumn(null); setDragOverCard(null);
        }}
        onClick={(e) => {
          if (cardDrag.current.moved) return; // don't open if just dropped
          setSelectedCard(conversation);
          setSelectedCardTab('details');
        }}
        className={cn(
          "pipeline-card relative select-auto",
          draggedCard === conversation.id && "dragging",
          hasUnread && "ring-1 ring-primary/40",
          isCardDropTarget && "ring-2 ring-primary/70 before:absolute before:-top-1.5 before:left-2 before:right-2 before:h-0.5 before:rounded before:bg-primary"
        )}
      >
        <div className="flex items-start gap-2">
          <GripVertical className="h-4 w-4 text-zinc-500 mt-0.5 cursor-grab flex-shrink-0" />

          <div className="relative flex-shrink-0">
            <ContactAvatar
              src={conversation.contact?.avatar_url}
              name={contactName || null}
              phone={contactPhone}
              contactId={contactId}
              instanceId={(conversation as any).whatsapp_instance_id}
              size={18}
              className="ring-1 ring-white/10"
            />
            <span
              className={cn(
                "absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full ring-1 ring-zinc-800",
                isTyping ? "bg-blue-400 animate-pulse" :
                  isRecording ? "bg-red-400 animate-pulse" :
                    isOnline ? "bg-green-400" : "bg-zinc-500"
              )}
              title={getPresenceLabel(isOnline, isTyping, isRecording)}
            />
          </div>

          <div className="min-w-0 flex-1 overflow-hidden">
            {note && (
              <div className="mb-1.5 rounded bg-amber-400/15 px-2 py-1 text-[10px] font-medium leading-tight text-amber-200 line-clamp-2">
                {note}
              </div>
            )}

            {visibleTags.length > 0 && (
              <div className={cn("mb-1.5 flex flex-wrap gap-1", tagDisplayMode === 'bars' && "gap-1.5")}>
                {visibleTags.map(tag => (
                  <span
                    key={tag.id}
                    className={cn(
                      tagDisplayMode === 'bars'
                        ? "h-1.5 w-10 rounded-full"
                        : "max-w-[92px] truncate rounded px-1.5 py-0.5 text-[9px] font-semibold leading-none"
                    )}
                    style={tagDisplayMode === 'bars'
                      ? { backgroundColor: tag.color }
                      : { backgroundColor: `${tag.color}30`, color: tag.color }}
                    title={tag.name}
                  >
                    {tagDisplayMode === 'labels' ? tag.name : null}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={cn("truncate text-[12px] font-semibold text-zinc-100", hasUnread && "text-white")} data-sensitive>
                  {hasName ? contactName : formattedPhone}
                </p>
                {hasName && (
                  <p className="mt-0.5 truncate text-[10px] text-zinc-400" data-sensitive>
                    {formattedPhone}
                  </p>
                )}
              </div>
              <div
                className="flex shrink-0 items-center gap-1"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                {isAIActive && <Bot className="h-3.5 w-3.5 text-purple-300" />}
                <ConversationCardActions
                  conversation={conversation}
                  variant="minimal"
                  onOpenChat={() => onConversationClick(conversation)}
                  workspaceId={selectedWorkspaceId}
                />
              </div>
            </div>

            {(isTyping || isRecording || followUpMap?.[conversation.id]) && (
              <div className="mt-1.5 flex items-center gap-1 text-[10px] text-zinc-300">
                {isTyping || isRecording ? (
                  <span className="font-medium text-green-300">{isTyping ? 'Digitando...' : 'Gravando audio...'}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded bg-orange-500/15 px-1.5 py-0.5 font-medium text-orange-300 animate-pulse">
                    <RefreshCw className="h-2.5 w-2.5" />
                    Follow-up #{followUpMap[conversation.id].step}
                  </span>
                )}
              </div>
            )}

            <div className="mt-1.5 flex items-center gap-2.5 text-[10px] text-zinc-400">
              <CardMetric
                icon={StickyNote}
                count={noteCount}
                label="notas"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedCard(conversation);
                  setSelectedCardTab('notes');
                }}
              />
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-zinc-100"
                title="checklist"
                onClick={(event) => {
                  event.stopPropagation();
                  setExpandedChecklistCardId(prev => {
                    const next = prev === conversation.id ? null : conversation.id;
                    if (!next) setShowAllChecklistCardId(null);
                    return next;
                  });
                }}
              >
                <ListTodo className="h-3.5 w-3.5" />
                <span>{doneTaskCount}/{taskCount}</span>
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-zinc-100"
                title="Anexos"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedCard(conversation);
                  setSelectedCardTab('files');
                }}
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span>{fileCount}</span>
              </button>
              <button
                type="button"
                className={cn(
                  "ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors",
                  hasUnread
                    ? "bg-primary text-primary-foreground shadow-[0_0_14px_hsl(var(--primary)/0.45)]"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                )}
                title="Abrir mensagens"
                onClick={(event) => {
                  event.stopPropagation();
                  onConversationClick(conversation);
                }}
              >
                <MessagesSquare className="h-3.5 w-3.5" />
                {hasUnread && <span className="font-bold">{conversation.unread_count}</span>}
              </button>
            </div>

            {expandedChecklistCardId === conversation.id && (
              <div
                className="mt-2 space-y-1.5 rounded-md border border-white/5 bg-black/15 p-2 text-zinc-200"
                onClick={(event) => event.stopPropagation()}
              >
                {checklistItems.length === 0 ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-zinc-500">Nenhum checklist neste card.</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-zinc-300"
                      onClick={() => {
                        setSelectedCard(conversation);
                        setSelectedCardTab('checklist');
                      }}
                    >
                      Adicionar
                    </Button>
                  </div>
                ) : (
                  <>
                    {(showAllChecklistCardId === conversation.id ? checklistItems : checklistItems.slice(0, 3)).map(item => (
                      <label key={item.id} className="flex items-start gap-2 rounded px-1 py-0.5 text-[11px]">
                        <input
                          type="checkbox"
                          checked={item.done}
                          className="mt-0.5 h-3.5 w-3.5 accent-primary"
                          onChange={async () => {
                            const nextChecklists = cardChecklists.map(cl => ({
                              ...cl,
                              items: cl.items.map(it => it.id === item.id ? { ...it, done: !it.done } : it)
                            }));
                            await saveChecklistsForConversation(conversation, nextChecklists);
                          }}
                        />
                        <span className={cn("min-w-0 flex-1 break-words", item.done && "text-zinc-500 line-through")}>{item.text}</span>
                      </label>
                    ))}
                    <div className="flex items-center justify-between border-t border-white/5 pt-1">
                      <span className="text-[10px] text-zinc-500">{doneTaskCount}/{taskCount} concluidos</span>
                      {checklistItems.length > 3 && (
                        <button
                          type="button"
                          className="text-[10px] font-medium text-zinc-400 hover:text-zinc-100"
                          onClick={() => {
                            setShowAllChecklistCardId(prev => prev === conversation.id ? null : conversation.id);
                          }}
                        >
                          {showAllChecklistCardId === conversation.id ? 'Ver menos' : `Ver mais ${checklistItems.length - 3}`}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    );

  };



  // Check if dragging over unassigned column
  const isDragOverUnassigned = dragOverColumn === 'unassigned';

  return (
    <div
      ref={scrollContainerRef}
      className={cn(
        "relative flex items-stretch gap-5 h-[calc(100vh-140px)] p-4",
        isMobile ? "select-auto overflow-x-auto overflow-y-hidden" : "select-none cursor-grab overflow-x-auto overflow-y-hidden"
      )}
      style={{
        touchAction: isMobile ? 'pan-x pan-y' : 'pan-y',
        WebkitOverflowScrolling: 'touch',
        backgroundColor: boardBackground,
        backgroundImage: boardBackgroundImage ? `linear-gradient(rgb(0 0 0 / 0.18), rgb(0 0 0 / 0.18)), url(${boardBackgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
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
      <div className="fixed right-6 top-20 z-40">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-md bg-black/30 text-white backdrop-blur hover:bg-black/45 hover:text-white"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Configuracoes do quadro</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={toggleTagDisplayMode}
              >
                <TagsIcon className="mr-2 h-4 w-4" />
                {tagDisplayMode === 'labels' ? 'Mostrar tags como barras' : 'Mostrar nome das tags'}
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Palette className="h-4 w-4" />
                Cor de fundo
              </div>
              <div className="flex flex-wrap gap-2">
                {BOARD_BACKGROUNDS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={cn(
                      "h-7 w-7 rounded-md border border-border",
                      !boardBackgroundImage && boardBackground === color && "ring-2 ring-primary"
                    )}
                    style={{ backgroundColor: color }}
                    title="Cor do fundo"
                    onClick={() => changeBoardBackground(color)}
                  />
                ))}
                <label
                  className={cn(
                    "flex h-7 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-border bg-muted p-0.5",
                    !boardBackgroundImage && !BOARD_BACKGROUNDS.includes(boardBackground) && "ring-2 ring-primary"
                  )}
                  title="Escolher cor"
                >
                  <input
                    type="color"
                    value={boardBackground}
                    className="h-full w-full cursor-pointer rounded border-0 bg-transparent p-0"
                    onChange={(event) => changeBoardBackground(event.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ImageIcon className="h-4 w-4" />
                Imagem de fundo
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BOARD_BACKGROUND_IMAGES.map(image => (
                  <button
                    key={image.url}
                    type="button"
                    className={cn(
                      "h-16 overflow-hidden rounded-md border border-border bg-cover bg-center text-left",
                      boardBackgroundImage === image.url && "ring-2 ring-primary"
                    )}
                    style={{ backgroundImage: `url(${image.url})` }}
                    onClick={() => changeBoardBackgroundImage(image.url)}
                  >
                    <span className="flex h-full items-end bg-black/20 p-1 text-[10px] font-semibold text-white">
                      {image.name}
                    </span>
                  </button>
                ))}
              </div>
              <Input
                placeholder="URL da imagem"
                value={boardBackgroundImage}
                onChange={(event) => changeBoardBackgroundImage(event.target.value)}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Unassigned column - show permanently when configured OR only when it contains items */}
      {(pipeline?.show_unassigned || unassignedConversations.length > 0) && (
        <div
          data-column-id="unassigned"
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
          </div>
          <div className="flex-1 min-h-0 space-y-2 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
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
            data-column-id={column.id}
            className={cn(
              "pipeline-column transition-all duration-300 border-l-4",
              isDragOver && "scale-[1.01]"
            )}
            style={{
              borderLeftColor: column.color,
              ...(isDragOver ? { boxShadow: `inset 0 0 20px ${column.color}15, 0 0 0 1px ${column.color}40` } : {}),
            }}
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setDragOverColumn(prev => prev === column.id ? null : prev);
              }
            }}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <div className="flex items-center justify-between mb-2 px-1 py-1">
              <div className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: column.color }}
                />
                <h3 className="font-semibold text-foreground text-sm dark:text-zinc-100">{column.name}</h3>
                <span
                  className="flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-muted text-[10px] font-bold text-muted-foreground dark:bg-white/10 dark:text-zinc-200"
                >
                  {columnConversations.length}
                </span>
              </div>
            </div>

            <div className="flex-1 min-h-0 space-y-2 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              {columnConversations.map(renderConversationCard)}
            </div>
          </div>
        );
      })}

      <PipelineCardDetailDialog
        conversation={selectedCard}
        open={!!selectedCard}
        initialTab={selectedCardTab}
        columns={columns}
        currentColumnId={selectedCard ? positions.find(position => position.conversation_id === selectedCard.id)?.column_id || null : null}
        workspaceId={selectedWorkspaceId}
        onMoveCard={handleMoveCardFromPanel}
        onOpenChange={(open) => {
          if (!open) setSelectedCard(null);
        }}
        onOpenChat={(conversation) => onConversationClick(conversation)}
      />
    </div>
  );
}

function PipelineCardDetailDialog({
  conversation,
  open,
  initialTab,
  columns,
  currentColumnId,
  workspaceId,
  onMoveCard,
  onOpenChange,
  onOpenChat,
}: {
  conversation: DbConversation | null;
  open: boolean;
  initialTab: CardPanelTab;
  columns: Array<{ id: string; name: string; color: string }>;
  currentColumnId: string | null;
  workspaceId?: string | null;
  onMoveCard: (conversation: DbConversation, columnId: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onOpenChat: (conversation: DbConversation) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<CardPanelTab>(initialTab);
  const [activeSideTab, setActiveSideTab] = useState<CardSideTab>('comments');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedObservation, setEditedObservation] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>(() => loadChecklistTemplates(workspaceId));
  const [cardChecklists, setCardChecklists] = useState<CardChecklist[]>([]);
  const [newChecklistItemByChecklist, setNewChecklistItemByChecklist] = useState<Record<string, string>>({});
  const [isTemplateTrayOpen, setIsTemplateTrayOpen] = useState(false);
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateDraftName, setTemplateDraftName] = useState('');
  const [templateDraftItems, setTemplateDraftItems] = useState<ChecklistItem[]>([]);
  const [newTemplateItem, setNewTemplateItem] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [draggedChecklistItemId, setDraggedChecklistItemId] = useState<string | null>(null);
  const [dragOverChecklistItemId, setDragOverChecklistItemId] = useState<string | null>(null);
  const [draggedTemplateItemId, setDraggedTemplateItemId] = useState<string | null>(null);
  const [dragOverTemplateItemId, setDragOverTemplateItemId] = useState<string | null>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const observationTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = descriptionTextareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [editedDescription, activeTab]);

  useEffect(() => {
    const el = observationTextareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [editedObservation, activeTab]);

  useEffect(() => {
    setActiveTab(initialTab === 'activity' ? 'details' : initialTab);
    setActiveSideTab(initialTab === 'activity' ? 'logs' : 'comments');
    setIsEditingName(false);
    setEditedName(conversation?.contact?.name || '');
    setEditedObservation((conversation?.contact?.metadata as { note?: string } | null)?.note || '');
    setEditedDescription(((conversation?.contact?.metadata as any)?.description as string) || '');
    setCardChecklists(conversation ? getCardChecklists(conversation) : []);
    setNewChecklistItemByChecklist({});
    setChecklistTemplates(loadChecklistTemplates(workspaceId));
    setIsTemplateTrayOpen(false);
    setIsTemplateEditorOpen(false);
    setEditingTemplateId(null);
    setTemplateDraftName('');
    setTemplateDraftItems([]);
    setNewTemplateItem('');
    setDraggedChecklistItemId(null);
    setDragOverChecklistItemId(null);
    setDraggedTemplateItemId(null);
    setDragOverTemplateItemId(null);
  }, [conversation?.id, conversation?.contact?.name, conversation?.contact?.metadata, workspaceId, initialTab]);

  if (!conversation) return null;

  const contact = conversation.contact;
  const contactId = contact?.id || null;
  const phone = contact?.phone || '';
  const formattedPhone = formatDialogPhone(phone);

  const saveContact = async () => {
    if (!contactId) return;
    setIsSaving(true);
    try {
      const currentMetadata = (contact?.metadata as Record<string, unknown>) || {};
      const updates: Record<string, unknown> = {
        metadata: {
          ...currentMetadata,
          note: editedObservation.trim() || null,
          description: editedDescription.trim() || null,
        },
      };
      if (editedName.trim()) updates.name = editedName.trim();

      const { error } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', contactId);

      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-contact-note-counts'] });
      toast({ title: 'Dados atualizados' });
      setIsEditingName(false);
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message || 'Nao foi possivel atualizar o contato.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateConversationMetadata = async (patch: Record<string, unknown>) => {
    const currentMetadata = (conversation.metadata as Record<string, unknown>) || {};
    const metadata = { ...currentMetadata, ...patch };
    const { error } = await supabase
      .from('conversations')
      .update({ metadata: metadata as any })
      .eq('id', conversation.id);

    if (error) throw error;
    const updatedConversation = { ...conversation, metadata } as DbConversation;
    queryClient.setQueriesData({ queryKey: ['conversations'] }, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map(item => item.id === conversation.id ? updatedConversation : item);
    });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['pipeline-conversations'] });
  };

  const saveCardChecklists = async (checklists: CardChecklist[]) => {
    setIsSaving(true);
    try {
      await updateConversationMetadata({ pipeline_checklists: checklists });
      toast({ title: 'Checklist salvo' });
    } catch (error: any) {
      toast({ title: 'Erro ao salvar checklist', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const addChecklistItem = async (checklistId: string) => {
    const text = (newChecklistItemByChecklist[checklistId] || '').trim();
    if (!text) return;
    const next = cardChecklists.map(cl =>
      cl.id === checklistId ? { ...cl, items: [...cl.items, { id: crypto.randomUUID(), text, done: false }] } : cl
    );
    setCardChecklists(next);
    setNewChecklistItemByChecklist(prev => ({ ...prev, [checklistId]: '' }));
    await saveCardChecklists(next);
  };

  const toggleChecklistItem = async (checklistId: string, itemId: string) => {
    const next = cardChecklists.map(cl =>
      cl.id === checklistId ? { ...cl, items: cl.items.map(it => it.id === itemId ? { ...it, done: !it.done } : it) } : cl
    );
    setCardChecklists(next);
    await saveCardChecklists(next);
  };

  const removeChecklistItem = async (checklistId: string, itemId: string) => {
    const next = cardChecklists.map(cl =>
      cl.id === checklistId ? { ...cl, items: cl.items.filter(it => it.id !== itemId) } : cl
    );
    setCardChecklists(next);
    await saveCardChecklists(next);
  };

  const removeChecklist = async (checklistId: string) => {
    const next = cardChecklists.filter(cl => cl.id !== checklistId);
    setCardChecklists(next);
    await saveCardChecklists(next);
  };

  const updateChecklistName = async (checklistId: string, name: string) => {
    const next = cardChecklists.map(cl =>
      cl.id === checklistId ? { ...cl, name } : cl
    );
    setCardChecklists(next);
    await saveCardChecklists(next);
  };

  const updateChecklistItemText = async (checklistId: string, itemId: string, text: string) => {
    const next = cardChecklists.map(cl =>
      cl.id === checklistId ? { ...cl, items: cl.items.map(it => it.id === itemId ? { ...it, text } : it) } : cl
    );
    setCardChecklists(next);
    await saveCardChecklists(next);
  };

  const reorderChecklistItem = async (checklistId: string, targetItemId: string) => {
    if (!draggedChecklistItemId || draggedChecklistItemId === targetItemId) {
      setDraggedChecklistItemId(null);
      setDragOverChecklistItemId(null);
      return;
    }
    const checklist = cardChecklists.find(cl => cl.id === checklistId);
    if (!checklist) return;
    const fromIndex = checklist.items.findIndex(it => it.id === draggedChecklistItemId);
    const toIndex = checklist.items.findIndex(it => it.id === targetItemId);
    if (fromIndex === -1 || toIndex === -1) { setDraggedChecklistItemId(null); setDragOverChecklistItemId(null); return; }
    const nextItems = [...checklist.items];
    const [moved] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, moved);
    const next = cardChecklists.map(cl => cl.id === checklistId ? { ...cl, items: nextItems } : cl);
    setCardChecklists(next);
    setDraggedChecklistItemId(null);
    setDragOverChecklistItemId(null);
    await saveCardChecklists(next);
  };

  const syncTemplateToCards = async (template: ChecklistTemplate) => {
    const cachedConversations = queryClient
      .getQueriesData<DbConversation[]>({ queryKey: ['conversations'] })
      .flatMap(([, data]) => data || []);
    const usingTemplate = cachedConversations.filter(item => {
      const checklists = getCardChecklists(item);
      return checklists.some(cl => cl.templateId === template.id);
    });

    await Promise.all(usingTemplate.map(async item => {
      const currentMetadata = (item.metadata as Record<string, unknown>) || {};
      const checklists = getCardChecklists(item);
      const updated = checklists.map(cl =>
        cl.templateId === template.id
          ? { ...cl, name: template.name, items: buildChecklistFromTemplate(template, cl.items) }
          : cl
      );
      const metadata = { ...currentMetadata, pipeline_checklists: updated };

      const { error } = await supabase
        .from('conversations')
        .update({ metadata })
        .eq('id', item.id);

      if (error) throw error;
    }));

    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['pipeline-conversations'] });
  };

  const startNewChecklistTemplate = () => {
    setIsTemplateTrayOpen(true);
    setIsTemplateEditorOpen(true);
    setEditingTemplateId(null);
    setTemplateDraftName('');
    setTemplateDraftItems([]);
    setNewTemplateItem('');
    setDraggedTemplateItemId(null);
    setDragOverTemplateItemId(null);
  };

  const editChecklistTemplate = (template: ChecklistTemplate) => {
    setIsTemplateTrayOpen(true);
    setIsTemplateEditorOpen(true);
    setEditingTemplateId(template.id);
    setTemplateDraftName(template.name);
    setTemplateDraftItems(template.items.map(item => ({ ...item, done: false })));
    setNewTemplateItem('');
    setDraggedTemplateItemId(null);
    setDragOverTemplateItemId(null);
  };

  const addTemplateDraftItem = () => {
    if (!newTemplateItem.trim()) return;
    setTemplateDraftItems(prev => [...prev, { id: crypto.randomUUID(), text: newTemplateItem.trim(), done: false }]);
    setNewTemplateItem('');
  };

  const updateTemplateDraftItemText = (itemId: string, text: string) => {
    setTemplateDraftItems(prev => prev.map(item => item.id === itemId ? { ...item, text } : item));
  };

  const removeTemplateDraftItem = (itemId: string) => {
    setTemplateDraftItems(prev => prev.filter(item => item.id !== itemId));
  };

  const reorderTemplateDraftItem = (targetItemId: string) => {
    if (!draggedTemplateItemId || draggedTemplateItemId === targetItemId) {
      setDraggedTemplateItemId(null);
      setDragOverTemplateItemId(null);
      return;
    }

    setTemplateDraftItems(prev => {
      const fromIndex = prev.findIndex(item => item.id === draggedTemplateItemId);
      const toIndex = prev.findIndex(item => item.id === targetItemId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setDraggedTemplateItemId(null);
    setDragOverTemplateItemId(null);
  };

  const saveChecklistTemplate = async () => {
    const cleanItems = templateDraftItems
      .map(item => ({ id: item.id || crypto.randomUUID(), text: item.text.trim(), done: false }))
      .filter(item => item.text);

    if (!templateDraftName.trim() || cleanItems.length === 0) return;

    const template: ChecklistTemplate = {
      id: editingTemplateId || crypto.randomUUID(),
      name: templateDraftName.trim(),
      workspaceId: workspaceId || null,
      items: cleanItems,
    };
    const next = editingTemplateId
      ? checklistTemplates.map(item => item.id === editingTemplateId ? template : item)
      : [...checklistTemplates, template];

    setChecklistTemplates(next);
    setEditingTemplateId(template.id);
    setIsTemplateEditorOpen(true);
    localStorage.setItem(getChecklistTemplateStorageKey(workspaceId), JSON.stringify(next));
    const templateHasBeenApplied = cardChecklists.some(cl => cl.templateId === template.id);
    if (templateHasBeenApplied) {
      const updatedChecklists = cardChecklists.map(cl =>
        cl.templateId === template.id
          ? { ...cl, name: template.name, items: buildChecklistFromTemplate(template, cl.items) }
          : cl
      );
      setCardChecklists(updatedChecklists);
      await saveCardChecklists(updatedChecklists);
    }
    if (editingTemplateId) await syncTemplateToCards(template);
    toast({ title: editingTemplateId ? 'Modelo de checklist atualizado' : 'Modelo de checklist criado' });
  };

  const deleteChecklistTemplate = async (templateId: string) => {
    const next = checklistTemplates.filter(item => item.id !== templateId);
    setChecklistTemplates(next);
    localStorage.setItem(getChecklistTemplateStorageKey(workspaceId), JSON.stringify(next));
    const nextCardChecklists = cardChecklists.map(cl =>
      cl.templateId === templateId ? { ...cl, templateId: null } : cl
    );
    setCardChecklists(nextCardChecklists);
    await saveCardChecklists(nextCardChecklists);
    if (editingTemplateId === templateId) {
      startNewChecklistTemplate();
      setIsTemplateEditorOpen(false);
    }
    toast({ title: 'Modelo removido' });
  };

  const moveToColumn = async (columnId: string) => {
    if (!conversation || !columnId || columnId === currentColumnId) return;
    setIsSaving(true);
    try {
      await onMoveCard(conversation, columnId);
      toast({ title: 'Card movido' });
    } catch (error: any) {
      toast({ title: 'Erro ao mover card', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const applyChecklistTemplate = async (templateId: string) => {
    const template = checklistTemplates.find(item => item.id === templateId);
    if (!template) return;
    if (cardChecklists.some(cl => cl.templateId === templateId)) {
      toast({ title: 'Modelo já aplicado', description: 'Este checklist já está presente no card.' });
      return;
    }
    // Add as new checklist below existing ones
    const newChecklist: CardChecklist = {
      id: crypto.randomUUID(),
      templateId: template.id,
      name: template.name,
      items: buildChecklistFromTemplate(template, []),
    };
    const next = [...cardChecklists, newChecklist];
    setCardChecklists(next);
    await saveCardChecklists(next);
  };

  const updateSelectedTemplateFromCard = async (checklistId: string) => {
    const checklist = cardChecklists.find(cl => cl.id === checklistId);
    if (!checklist?.templateId) return;
    const template = checklistTemplates.find(item => item.id === checklist.templateId);
    if (!template) return;
    const nextTemplate: ChecklistTemplate = {
      ...template,
      items: checklist.items
        .map(item => ({ id: item.id || crypto.randomUUID(), text: item.text.trim(), done: false }))
        .filter(item => item.text),
    };
    const next = checklistTemplates.map(item => item.id === nextTemplate.id ? nextTemplate : item);
    setChecklistTemplates(next);
    localStorage.setItem(getChecklistTemplateStorageKey(workspaceId), JSON.stringify(next));
    if (editingTemplateId === nextTemplate.id) {
      setTemplateDraftItems(nextTemplate.items);
    }
    await syncTemplateToCards(nextTemplate);
    toast({ title: 'Modelo atualizado com este card' });
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    const comments = (((conversation.metadata as any)?.pipeline_comments || []) as Array<{ id: string; text: string; created_at: string; author: string }>);
    const next = [
      {
        id: crypto.randomUUID(),
        text: newComment.trim(),
        created_at: new Date().toISOString(),
        author: 'Usuario',
      },
      ...comments,
    ];
    setNewComment('');
    try {
      await updateConversationMetadata({ pipeline_comments: next });
      toast({ title: 'Comentario adicionado' });
    } catch (error: any) {
      toast({ title: 'Erro ao comentar', description: error.message, variant: 'destructive' });
    }
  };

  const tabs = [
    { id: 'details' as const, label: 'Dados', icon: AlignLeft },
    { id: 'checklist' as const, label: 'Checklist', icon: CheckSquare },
    { id: 'notes' as const, label: 'Notas', icon: StickyNote },
    { id: 'files' as const, label: 'Anexos', icon: Paperclip },
    { id: 'contracts' as const, label: 'Contratos', icon: FileSignature },
  ];
  const comments = (((conversation.metadata as any)?.pipeline_comments || []) as Array<{ id: string; text: string; created_at: string; author: string }>);
  const totalItems = cardChecklists.flatMap(cl => cl.items).length;
  const totalDone = cardChecklists.flatMap(cl => cl.items).filter(it => it.done).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] w-[min(98vw,1280px)] max-w-none p-0 gap-0 overflow-hidden border-border bg-card text-card-foreground dark:bg-[#15161d] dark:text-zinc-100 dark:border-zinc-700 [&>button.absolute]:hidden">
        <div className="flex h-full min-h-0">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-border px-5 py-4 dark:border-zinc-700">
              <div className="flex min-w-0 items-center gap-3">
                <ContactAvatar
                  src={contact?.avatar_url}
                  name={contact?.name || null}
                  phone={contact?.phone}
                  contactId={contact?.id}
                  instanceId={(conversation as any).whatsapp_instance_id}
                  size={44}
                  className="shrink-0"
                />
                <div className="min-w-0">
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editedName}
                        onChange={(event) => setEditedName(event.target.value)}
                        className="h-8 border-transparent bg-muted/60 text-foreground focus-visible:border-border dark:bg-zinc-900/35 dark:text-zinc-100 dark:focus-visible:border-zinc-600"
                        autoFocus
                      />
                      <Button size="icon" className="h-9 w-9" onClick={saveContact} disabled={isSaving}>
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    </div>
                  ) : (
                    <button
                    className="max-w-full truncate text-left text-2xl font-semibold text-foreground hover:text-primary dark:text-zinc-100"
                      onClick={() => setIsEditingName(true)}
                    >
                      {contact?.name || formattedPhone}
                    </button>
                  )}
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground dark:text-zinc-400">
                    <Phone className="h-3.5 w-3.5" />
                    <span data-sensitive>{formattedPhone}</span>
                    {contact?.email && (
                      <>
                        <span>•</span>
                        <span data-sensitive className="truncate">{contact.email}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:bg-accent hover:text-foreground dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                  onClick={() => onOpenChat(conversation)}
                >
                  <MessagesSquare className="mr-2 h-4 w-4" />
                  Mensagens
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:bg-accent hover:text-foreground dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="flex border-b border-border px-5 dark:border-zinc-700">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    className={cn(
                      "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                      activeTab === tab.id
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground dark:text-zinc-400 dark:hover:text-zinc-100"
                    )}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              {activeTab === 'details' && (
                <div className="max-w-2xl space-y-5">
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground dark:text-zinc-200">Observacao</h3>
                      <Button size="sm" onClick={saveContact} disabled={isSaving} className="h-8">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
                        Salvar
                      </Button>
                    </div>
                    <Textarea
                      ref={observationTextareaRef}
                      value={editedObservation}
                      onChange={(event) => {
                        setEditedObservation(event.target.value);
                        const el = event.target as HTMLTextAreaElement;
                        el.style.height = 'auto';
                        el.style.height = el.scrollHeight + 'px';
                      }}
                      onFocus={(event) => {
                        const el = event.target as HTMLTextAreaElement;
                        el.style.height = 'auto';
                        el.style.height = el.scrollHeight + 'px';
                      }}
                      placeholder="Adicionar observacao..."
                      className="resize-y min-h-[44px] max-h-[200px] overflow-y-auto rounded-md border-transparent bg-muted/60 text-sm text-foreground focus-visible:border-border dark:bg-zinc-900/35 dark:text-zinc-100 dark:focus-visible:border-zinc-600"
                    />
                  </section>

                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground dark:text-zinc-200">Descricao</h3>
                    </div>
                    <Textarea
                      ref={descriptionTextareaRef}
                      value={editedDescription}
                      onChange={(event) => {
                        setEditedDescription(event.target.value);
                        const el = event.target as HTMLTextAreaElement;
                        el.style.height = 'auto';
                        el.style.height = el.scrollHeight + 'px';
                      }}
                      onFocus={(event) => {
                        const el = event.target as HTMLTextAreaElement;
                        el.style.height = 'auto';
                        el.style.height = el.scrollHeight + 'px';
                      }}
                      placeholder="Adicionar descricao do card..."
                      rows={4}
                      className="resize-y min-h-[6rem] max-h-[300px] overflow-y-auto rounded-md border-transparent bg-muted/60 text-sm text-foreground focus-visible:border-border dark:bg-zinc-900/35 dark:text-zinc-100 dark:focus-visible:border-zinc-600"
                    />
                  </section>

                  <Separator className="bg-border dark:bg-zinc-700" />

                  <section className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md bg-muted/50 p-3 dark:bg-zinc-900/40">
                      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground dark:text-zinc-500">
                        <Phone className="h-3.5 w-3.5" />
                        Telefone
                      </div>
                      <p className="mt-2 text-sm text-foreground dark:text-zinc-100" data-sensitive>{formattedPhone}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3 dark:bg-zinc-900/40">
                      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground dark:text-zinc-500">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Criado em
                      </div>
                      <p className="mt-2 text-sm text-foreground dark:text-zinc-100">
                        {new Date(contact?.created_at || conversation.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'checklist' && (
                <div className="max-w-2xl space-y-5">
                  <div className="rounded-md bg-zinc-900/30 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-2 text-left"
                        onClick={() => setIsTemplateTrayOpen(prev => !prev)}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-950/45 text-zinc-400">
                          {isTemplateTrayOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-zinc-100">Modelos de checklist</span>
                          <span className="block text-xs text-zinc-500">
                            {isTemplateTrayOpen ? `${checklistTemplates.length} modelos salvos` : 'Clique para ver a bandeja de modelos'}
                          </span>
                        </span>
                      </button>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const newChecklist: CardChecklist = {
                              id: crypto.randomUUID(),
                              templateId: null,
                              name: 'Checklist',
                              items: [],
                            };
                            const next = [...cardChecklists, newChecklist];
                            setCardChecklists(next);
                            await saveCardChecklists(next);
                          }}
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          Novo Checklist
                        </Button>
                        <Button
                          variant={isTemplateTrayOpen ? 'ghost' : 'outline'}
                          size="sm"
                          onClick={() => setIsTemplateTrayOpen(prev => !prev)}
                        >
                          {isTemplateTrayOpen ? 'Ocultar' : 'Mostrar'}
                        </Button>
                      </div>
                    </div>

                    {isTemplateTrayOpen && (
                      <>
                        <div className="flex justify-end">
                          <Button size="sm" onClick={startNewChecklistTemplate}>
                            <Plus className="mr-2 h-3.5 w-3.5" />
                            Novo modelo
                          </Button>
                        </div>

                        <div className="space-y-2">
                          {checklistTemplates.length === 0 ? (
                            <p className="text-sm text-zinc-500">Nenhum modelo salvo.</p>
                          ) : checklistTemplates.map(template => {
                            const isTemplateApplied = cardChecklists.some(cl => cl.templateId === template.id);
                            return (
                              <div
                                key={template.id}
                                className={cn(
                                  "flex w-full flex-wrap items-center justify-between gap-2 rounded-md bg-zinc-950/35 px-3 py-2 text-sm",
                                  isTemplateApplied && "ring-1 ring-primary/50"
                                )}
                              >
                                <div className="min-w-[160px] flex-1">
                                  <span className="block truncate text-zinc-100">{template.name}</span>
                                  {isTemplateApplied && (
                                    <span className="text-xs text-primary">Aplicado neste card</span>
                                  )}
                                </div>
                                <Badge variant="secondary">{template.items.length} itens</Badge>
                                <Button
                                  variant={isTemplateApplied ? 'secondary' : 'outline'}
                                  size="sm"
                                  className="h-7"
                                  onClick={() => applyChecklistTemplate(template.id)}
                                  disabled={isTemplateApplied}
                                >
                                  {isTemplateApplied ? 'Aplicado' : 'Aplicar'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-zinc-500 hover:text-zinc-100"
                                  onClick={() => editChecklistTemplate(template)}
                                  title="Editar modelo"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-zinc-500 hover:text-destructive"
                                  onClick={() => deleteChecklistTemplate(template.id)}
                                  title="Remover modelo"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {isTemplateTrayOpen && isTemplateEditorOpen && (
                      <div className="rounded-md border border-zinc-800 bg-zinc-950/25 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-zinc-100">
                              {editingTemplateId ? 'Editar modelo' : 'Novo modelo'}
                            </h4>
                            <p className="text-xs text-zinc-500">{templateDraftItems.length} tarefas no modelo</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-zinc-400 hover:text-zinc-100"
                            onClick={() => setIsTemplateEditorOpen(false)}
                          >
                            Fechar
                          </Button>
                        </div>

                        <Input
                          value={templateDraftName}
                          onChange={(event) => setTemplateDraftName(event.target.value)}
                          placeholder="Nome do modelo"
                          className="mb-3 bg-zinc-900/60 border-zinc-700 text-zinc-100"
                        />

                        <div className="space-y-2">
                          {templateDraftItems.map(item => (
                            <div
                              key={item.id}
                              className={cn(
                                "flex items-center gap-2 rounded-md bg-zinc-950/45 p-2 transition-colors",
                                dragOverTemplateItemId === item.id && draggedTemplateItemId !== item.id && "bg-primary/10 ring-1 ring-primary/40",
                                draggedTemplateItemId === item.id && "opacity-60"
                              )}
                              onDragOver={(event) => {
                                if (!draggedTemplateItemId || draggedTemplateItemId === item.id) return;
                                event.preventDefault();
                                setDragOverTemplateItemId(item.id);
                              }}
                              onDragLeave={(event) => {
                                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                  setDragOverTemplateItemId(prev => prev === item.id ? null : prev);
                                }
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                reorderTemplateDraftItem(item.id);
                              }}
                            >
                              <button
                                type="button"
                                draggable
                                onDragStart={(event) => {
                                  setDraggedTemplateItemId(item.id);
                                  event.dataTransfer.effectAllowed = 'move';
                                  event.dataTransfer.setData('text/plain', item.id);
                                }}
                                onDragEnd={() => {
                                  setDraggedTemplateItemId(null);
                                  setDragOverTemplateItemId(null);
                                }}
                                className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-zinc-500 hover:bg-white/5 hover:text-zinc-200 active:cursor-grabbing"
                                title="Reordenar tarefa"
                              >
                                <GripVertical className="h-4 w-4" />
                              </button>
                              <Input
                                value={item.text}
                                onChange={(event) => updateTemplateDraftItemText(item.id, event.target.value)}
                                className="h-8 flex-1 border-transparent bg-transparent px-1 text-sm text-zinc-100 focus-visible:border-zinc-700 focus-visible:bg-zinc-900/60"
                              />
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-destructive" onClick={() => removeTemplateDraftItem(item.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}

                          <div className="flex gap-2">
                            <Input
                              value={newTemplateItem}
                              onChange={(event) => setNewTemplateItem(event.target.value)}
                              placeholder="Adicionar tarefa ao modelo..."
                              className="bg-zinc-900/60 border-zinc-700 text-zinc-100"
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') addTemplateDraftItem();
                              }}
                            />
                            <Button onClick={addTemplateDraftItem}>
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={() => setIsTemplateEditorOpen(false)}>
                              Cancelar
                            </Button>
                            <Button onClick={saveChecklistTemplate} disabled={!templateDraftName.trim() || templateDraftItems.length === 0}>
                              <Save className="mr-2 h-3.5 w-3.5" />
                              Salvar modelo
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {cardChecklists.length === 0 ? (
                    <div className="rounded-md bg-zinc-900/30 p-6 text-center border border-white/5">
                      <p className="text-sm text-zinc-500">Nenhum checklist neste card.</p>
                      <Button
                        size="sm"
                        className="mt-3"
                        onClick={async () => {
                          const newChecklist: CardChecklist = {
                            id: crypto.randomUUID(),
                            templateId: null,
                            name: 'Checklist',
                            items: [],
                          };
                          const next = [...cardChecklists, newChecklist];
                          setCardChecklists(next);
                          await saveCardChecklists(next);
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Criar Checklist
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {cardChecklists.map((checklist) => {
                        const total = checklist.items.length;
                        const done = checklist.items.filter(it => it.done).length;
                        const hasTemplate = !!checklist.templateId;
                        const templateName = hasTemplate
                          ? checklistTemplates.find(t => t.id === checklist.templateId)?.name
                          : null;

                        return (
                          <div key={checklist.id} className="rounded-md bg-zinc-900/30 p-4 border border-white/5 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex-1 min-w-[200px]">
                                <Input
                                  value={checklist.name}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setCardChecklists(prev => prev.map(cl =>
                                      cl.id === checklist.id ? { ...cl, name: value } : cl
                                    ));
                                  }}
                                  onBlur={(event) => updateChecklistName(checklist.id, event.target.value.trim() || 'Checklist')}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.currentTarget.blur();
                                    }
                                  }}
                                  className="h-8 border-transparent bg-transparent px-1 text-sm font-semibold text-zinc-100 focus-visible:border-zinc-700 focus-visible:bg-zinc-900/60 w-full"
                                />
                                <div className="flex items-center gap-1.5 mt-0.5 px-1 text-xs text-zinc-500">
                                  <span>{done}/{total} concluídos</span>
                                  {templateName && (
                                    <>
                                      <span>·</span>
                                      <span className="text-primary/80" title={`Modelo: ${templateName}`}>
                                        Modelo: {templateName}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {hasTemplate && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => updateSelectedTemplateFromCard(checklist.id)}
                                    disabled={isSaving || checklist.items.length === 0}
                                    title="Atualizar o modelo com os itens atuais deste checklist"
                                  >
                                    Atualizar modelo
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-zinc-500 hover:text-destructive"
                                  onClick={() => removeChecklist(checklist.id)}
                                  title="Excluir checklist"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Checklist Items */}
                            <div className="space-y-2">
                              {checklist.items.map(item => (
                                <div
                                  key={item.id}
                                  className={cn(
                                    "flex items-center gap-2 rounded-md bg-zinc-950/35 p-2 transition-colors",
                                    dragOverChecklistItemId === item.id && draggedChecklistItemId !== item.id && "bg-primary/10 ring-1 ring-primary/40",
                                    draggedChecklistItemId === item.id && "opacity-60"
                                  )}
                                  onDragOver={(event) => {
                                    if (!draggedChecklistItemId || draggedChecklistItemId === item.id) return;
                                    event.preventDefault();
                                    setDragOverChecklistItemId(item.id);
                                  }}
                                  onDragLeave={(event) => {
                                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                      setDragOverChecklistItemId(prev => prev === item.id ? null : prev);
                                    }
                                  }}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    reorderChecklistItem(checklist.id, item.id);
                                  }}
                                >
                                  <button
                                    type="button"
                                    draggable
                                    onDragStart={(event) => {
                                      setDraggedChecklistItemId(item.id);
                                      event.dataTransfer.effectAllowed = 'move';
                                      event.dataTransfer.setData('text/plain', item.id);
                                    }}
                                    onDragEnd={() => {
                                      setDraggedChecklistItemId(null);
                                      setDragOverChecklistItemId(null);
                                    }}
                                    className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-zinc-500 hover:bg-white/5 hover:text-zinc-200 active:cursor-grabbing"
                                    title="Reordenar tarefa"
                                  >
                                    <GripVertical className="h-4 w-4" />
                                  </button>
                                  <input
                                    type="checkbox"
                                    checked={item.done}
                                    onChange={() => toggleChecklistItem(checklist.id, item.id)}
                                    className="h-4 w-4 accent-primary"
                                  />
                                  <Input
                                    value={item.text}
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      setCardChecklists(prev => prev.map(cl =>
                                        cl.id === checklist.id
                                          ? { ...cl, items: cl.items.map(it => it.id === item.id ? { ...it, text: value } : it) }
                                          : cl
                                      ));
                                    }}
                                    onBlur={(event) => updateChecklistItemText(checklist.id, item.id, event.target.value.trim())}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') {
                                        event.currentTarget.blur();
                                      }
                                    }}
                                    className={cn(
                                      "h-8 flex-1 border-transparent bg-transparent px-1 text-sm text-zinc-100 focus-visible:border-zinc-700 focus-visible:bg-zinc-900/60",
                                      item.done && "text-zinc-500 line-through"
                                    )}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-zinc-500 hover:text-destructive"
                                    onClick={() => removeChecklistItem(checklist.id, item.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ))}

                              {/* Add checklist item */}
                              <div className="flex gap-2 pt-1">
                                <Input
                                  value={newChecklistItemByChecklist[checklist.id] || ''}
                                  onChange={(event) => setNewChecklistItemByChecklist(prev => ({
                                    ...prev,
                                    [checklist.id]: event.target.value
                                  }))}
                                  placeholder="Adicionar tarefa..."
                                  className="bg-zinc-900/60 border-zinc-700 text-zinc-100 h-8 text-xs"
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') addChecklistItem(checklist.id);
                                  }}
                                />
                                <Button size="sm" className="h-8 px-3" onClick={() => addChecklistItem(checklist.id)}>
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'files' && contactId && (
                <div className="rounded-md bg-muted/40 p-4 dark:bg-zinc-900/25">
                  <ContactFilesSection contactId={contactId} />
                </div>
              )}

              {activeTab === 'contracts' && contactId && (
                <div className="rounded-md bg-muted/40 p-4 dark:bg-zinc-900/25">
                  <ContactContractsSection
                    contactId={contactId}
                    conversationId={conversation.id}
                    contactName={contact?.name}
                    contactPhone={contact?.phone}
                    contactEmail={contact?.email}
                  />
                </div>
              )}

              {activeTab === 'notes' && contactId && (
                <div className="rounded-md bg-muted/40 p-4 dark:bg-zinc-900/25">
                  <ContactNotesSection contactId={contactId} />
                </div>
              )}

            </div>
          </div>

          <aside className="hidden w-[340px] shrink-0 border-l border-border bg-muted/35 lg:flex lg:min-h-0 lg:flex-col dark:border-zinc-700 dark:bg-[#1b1d22]">
            <div className="border-b border-border p-4 pb-3 dark:border-zinc-700">
              <h3 className="text-sm font-semibold text-foreground dark:text-zinc-200">Atividade do atendimento</h3>
              <div className="mt-3 grid grid-cols-2 gap-1 rounded-md bg-muted p-1 dark:bg-zinc-950/50">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-8 rounded-sm text-xs text-muted-foreground hover:bg-background hover:text-foreground dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
                    activeSideTab === 'comments' && 'bg-background text-foreground shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
                  )}
                  onClick={() => setActiveSideTab('comments')}
                >
                  Comentarios
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-8 rounded-sm text-xs text-muted-foreground hover:bg-background hover:text-foreground dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
                    activeSideTab === 'logs' && 'bg-background text-foreground shadow-sm dark:bg-zinc-800 dark:text-zinc-100'
                  )}
                  onClick={() => setActiveSideTab('logs')}
                >
                  Logs
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {activeSideTab === 'comments' ? (
                <div className="space-y-3">
                  <Textarea
                    value={newComment}
                    onChange={(event) => setNewComment(event.target.value)}
                    placeholder="Escrever um comentario..."
                    className="min-h-[72px] resize-none border-border bg-background text-foreground dark:bg-zinc-900/60 dark:border-zinc-700 dark:text-zinc-100"
                  />
                  <Button size="sm" className="w-full" onClick={addComment} disabled={!newComment.trim()}>
                    Comentar
                  </Button>
                  {comments.length > 0 ? (
                    <div className="space-y-2">
                      {comments.map(comment => (
                        <div key={comment.id} className="rounded-md bg-background p-2 dark:bg-zinc-900/50">
                          <p className="text-sm text-foreground whitespace-pre-wrap dark:text-zinc-100">{comment.text}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground dark:text-zinc-500">
                            {comment.author} • {new Date(comment.created_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground dark:border-zinc-700 dark:text-zinc-500">
                      Nenhum comentario ainda.
                    </p>
                  )}
                </div>
              ) : (
                <ContactLogsSection conversationId={conversation.id} />
              )}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatDialogPhone(phone: string) {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 13 && cleaned.startsWith('55')) {
    return `+55 (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith('55')) {
    return `+55 (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
  }
  return phone;
}
