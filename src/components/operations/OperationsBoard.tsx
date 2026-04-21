import { useMemo } from 'react';
import { useCases, useCaseStatuses, useUpdateCase } from '@/hooks/useOperationsCases';
import { CaseCard } from './CaseCard';
import { Loader2, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useTags } from '@/hooks/useTags';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface Props {
  filters: any;
  categoryId?: string | null;
  onOpenCase: (id: string) => void;
}

export function OperationsBoard({ filters, categoryId, onOpenCase }: Props) {
  const { data: cases = [], isLoading } = useCases(filters);
  const { data: statuses = [] } = useCaseStatuses(categoryId);
  const update = useUpdateCase();
  const { profile } = useAuth();
  const { data: tags = [] } = useTags();

  // Tarefas por caso
  const { data: tasksByCase = {} } = useQuery({
    queryKey: ['tasks-by-case', profile?.organization_id, cases.map((c: any) => c.id).join(',')],
    queryFn: async () => {
      if (cases.length === 0) return {};
      const { data } = await (supabase as any)
        .from('case_tasks')
        .select('case_id, status, due_date, completed_at')
        .in('case_id', cases.map((c: any) => c.id));
      const map: Record<string, { total: number; done: number; nextDue?: string | null }> = {};
      (data || []).forEach((t: any) => {
        if (!map[t.case_id]) map[t.case_id] = { total: 0, done: 0, nextDue: null };
        map[t.case_id].total++;
        if (t.status === 'done' || t.completed_at) map[t.case_id].done++;
        else if (t.due_date) {
          const cur = map[t.case_id].nextDue;
          if (!cur || new Date(t.due_date) < new Date(cur)) map[t.case_id].nextDue = t.due_date;
        }
      });
      return map;
    },
    enabled: cases.length > 0,
  });

  // Tags por contato (para exibir no card)
  const contactIds = useMemo(
    () => Array.from(new Set(cases.map((c: any) => c.contact?.id).filter(Boolean))),
    [cases],
  );

  const { data: contactTagsByContact = {} } = useQuery({
    queryKey: ['operations-contact-tags', contactIds.join(',')],
    queryFn: async () => {
      if (contactIds.length === 0) return {};
      const { data } = await supabase
        .from('contact_tags')
        .select('contact_id, tag_id')
        .in('contact_id', contactIds);
      const map: Record<string, string[]> = {};
      (data || []).forEach((row: any) => {
        if (!map[row.contact_id]) map[row.contact_id] = [];
        map[row.contact_id].push(row.tag_id);
      });
      return map;
    },
    enabled: contactIds.length > 0,
  });

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    statuses.forEach((s: any) => (map[s.id] = []));
    cases.forEach((c: any) => {
      if (c.status_id && map[c.status_id]) map[c.status_id].push(c);
    });
    return map;
  }, [cases, statuses]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const caseId = result.draggableId;
    const newStatusId = result.destination.droppableId;
    if (result.source.droppableId !== newStatusId) {
      update.mutate({ id: caseId, status_id: newStatusId });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (statuses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Inbox className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">Sem colunas configuradas</p>
        <p className="text-sm text-center mt-2">
          Configure os status desta categoria para começar.
        </p>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 h-[calc(100vh-200px)] overflow-x-auto overflow-y-hidden">
        {statuses.map((s: any) => {
          const items = grouped[s.id] || [];
          return (
            <Droppable droppableId={s.id} key={s.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    'pipeline-column transition-all duration-300 border-l-4',
                    snapshot.isDraggingOver && 'scale-[1.01]',
                  )}
                  style={{
                    borderLeftColor: s.color,
                    ...(snapshot.isDraggingOver
                      ? { boxShadow: `inset 0 0 20px ${s.color}15, 0 0 0 1px ${s.color}40` }
                      : {}),
                  }}
                >
                  <div
                    className="flex items-center justify-between mb-3 px-2 py-1.5 -mx-3 -mt-3 rounded-t-xl"
                    style={{ backgroundColor: `${s.color}15` }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                      <h3 className="font-semibold text-foreground text-sm">{s.name}</h3>
                      <span
                        className="flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: s.color }}
                      >
                        {items.length}
                      </span>
                    </div>
                  </div>

                  <div
                    className="space-y-2 min-h-[200px] overflow-y-auto flex-1"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    {items.map((c: any, idx: number) => {
                      const contactTagIds = c.contact?.id
                        ? contactTagsByContact[c.contact.id] || []
                        : [];
                      const cardTags = tags.filter((t) => contactTagIds.includes(t.id));
                      return (
                        <Draggable draggableId={c.id} index={idx} key={c.id}>
                          {(p) => (
                            <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}>
                              <CaseCard
                                case_={c}
                                taskStats={tasksByCase[c.id]}
                                contactTags={cardTags}
                                onClick={() => onOpenCase(c.id)}
                              />
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          );
        })}
      </div>
    </DragDropContext>
  );
}
