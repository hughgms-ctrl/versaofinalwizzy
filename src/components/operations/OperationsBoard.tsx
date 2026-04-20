import { useMemo } from 'react';
import { useCases, useCaseStatuses, useUpdateCase } from '@/hooks/useOperationsCases';
import { CaseCard } from './CaseCard';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
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

  // Carrega contagem de tarefas por caso
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

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[60vh]">
        {statuses.map((s: any) => (
          <Droppable droppableId={s.id} key={s.id}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={cn(
                  'flex-shrink-0 w-96 rounded-lg p-3 transition-colors',
                  snapshot.isDraggingOver ? 'bg-muted' : 'bg-muted/40'
                )}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <h3 className="text-sm font-semibold">{s.name}</h3>
                  </div>
                  <span className="text-xs text-muted-foreground bg-background/60 px-2 py-0.5 rounded-full">
                    {(grouped[s.id] || []).length}
                  </span>
                </div>
                <div className="space-y-2 min-h-[40px]">
                  {(grouped[s.id] || []).map((c: any, idx: number) => (
                    <Draggable draggableId={c.id} index={idx} key={c.id}>
                      {(p) => (
                        <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}>
                          <CaseCard case_={c} taskStats={tasksByCase[c.id]} onClick={() => onOpenCase(c.id)} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              </div>
            )}
          </Droppable>
        ))}
      </div>
    </DragDropContext>
  );
}
