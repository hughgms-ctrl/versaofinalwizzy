import { useMemo } from 'react';
import { useCases, useCaseStatuses } from '@/hooks/useOperationsCases';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTags } from '@/hooks/useTags';
import { ContactAvatar } from '@/components/conversations/ContactAvatar';
import { Loader2, Inbox, Scale, Building2, MessageSquare, Clock, AlertTriangle, ListTodo } from 'lucide-react';
import { format, formatDistanceToNow, differenceInHours, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Props {
  filters: any;
  categoryId?: string | null;
  onOpenCase: (id: string) => void;
}

function formatPhoneNumber(phone: string) {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 13) return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  if (cleaned.length === 12) return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
  return phone;
}

const priorityStyle: Record<string, { label: string; className: string }> = {
  urgent: { label: 'Urgente', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  high: { label: 'Alta', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20' },
  medium: { label: 'Média', className: 'bg-muted text-muted-foreground border-transparent' },
  low: { label: 'Baixa', className: 'bg-muted text-muted-foreground border-transparent' },
};

export function OperationsListView({ filters, categoryId, onOpenCase }: Props) {
  const { data: cases = [], isLoading } = useCases(filters);
  const { data: statuses = [] } = useCaseStatuses(categoryId);
  const { profile } = useAuth();
  const { data: tags = [] } = useTags();

  const statusMap = useMemo(() => {
    const m: Record<string, any> = {};
    statuses.forEach((s: any) => (m[s.id] = s));
    return m;
  }, [statuses]);

  const { data: tasksByCase = {} } = useQuery({
    queryKey: ['tasks-by-case-list', profile?.organization_id, cases.map((c: any) => c.id).join(',')],
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

  const contactIds = useMemo(
    () => Array.from(new Set(cases.map((c: any) => c.contact?.id).filter(Boolean))),
    [cases],
  );

  const { data: contactTagsByContact = {} } = useQuery({
    queryKey: ['operations-contact-tags-list', contactIds.join(',')],
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Inbox className="h-16 w-16 mb-4 opacity-30" />
        <p className="text-lg font-medium">Nenhum caso encontrado</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">Cliente</th>
              <th className="px-3 py-2.5">Caso</th>
              <th className="px-3 py-2.5 hidden md:table-cell">Categoria</th>
              <th className="px-3 py-2.5 hidden lg:table-cell">Status</th>
              <th className="px-3 py-2.5 hidden xl:table-cell">Tags</th>
              <th className="px-3 py-2.5 hidden lg:table-cell">Tarefas</th>
              <th className="px-3 py-2.5 hidden md:table-cell">Prazo</th>
              <th className="px-3 py-2.5 hidden xl:table-cell">Responsável</th>
              <th className="px-3 py-2.5">Aberto</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c: any) => {
              const status = c.status_id ? statusMap[c.status_id] : null;
              const stats = tasksByCase[c.id];
              const Icon = c.kind === 'judicial' ? Scale : Building2;
              const phone = c.contact?.phone || '';
              const formatted = phone ? formatPhoneNumber(phone) : '';
              const displayName = c.contact?.name || formatted || 'Sem contato';
              const priority = priorityStyle[c.priority];
              const contactTagIds = c.contact?.id ? (contactTagsByContact as any)[c.contact.id] || [] : [];
              const cardTags = tags.filter((t) => contactTagIds.includes(t.id));
              const unreadCount = c.conversation?.unread_count || 0;

              let dueBadge: React.ReactNode = null;
              if (stats?.nextDue) {
                const due = new Date(stats.nextDue);
                const hours = differenceInHours(due, new Date());
                if (isPast(due)) {
                  dueBadge = (
                    <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 text-destructive px-1.5 py-0.5 text-[10px] font-medium">
                      <AlertTriangle className="h-2.5 w-2.5" /> Vencida
                    </span>
                  );
                } else if (hours < 24) {
                  dueBadge = (
                    <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 text-destructive px-1.5 py-0.5 text-[10px] font-medium">
                      <Clock className="h-2.5 w-2.5" /> {hours}h
                    </span>
                  );
                } else if (hours < 72) {
                  dueBadge = (
                    <span className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 text-[10px] font-medium">
                      <Clock className="h-2.5 w-2.5" /> {Math.ceil(hours / 24)}d
                    </span>
                  );
                } else {
                  dueBadge = (
                    <span className="text-[11px] text-muted-foreground">
                      {format(due, 'dd/MM', { locale: ptBR })}
                    </span>
                  );
                }
              }

              const progress = stats && stats.total > 0 ? (stats.done / stats.total) * 100 : 0;

              return (
                <tr
                  key={c.id}
                  className="border-b border-border/50 last:border-b-0 hover:bg-muted/40 cursor-pointer transition-colors"
                  onClick={() => onOpenCase(c.id)}
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative flex-shrink-0">
                        <ContactAvatar
                          src={c.contact?.avatar_url}
                          name={c.contact?.name || null}
                          phone={phone}
                          contactId={c.contact?.id}
                          size={32}
                        />
                        <div
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center ring-2 ring-card',
                            c.kind === 'judicial' ? 'bg-primary' : 'bg-blue-500',
                          )}
                        >
                          <Icon className="h-2 w-2 text-white" />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p data-sensitive className="text-sm font-medium truncate text-foreground">
                          {displayName}
                        </p>
                        {c.contact?.name && formatted && (
                          <p data-sensitive className="text-[10px] text-muted-foreground truncate">
                            {formatted}
                          </p>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-1.5 py-0.5">
                          <MessageSquare className="h-2.5 w-2.5" /> {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 max-w-xs">
                    <p className="text-[13px] text-foreground line-clamp-1">{c.title}</p>
                    {priority && (
                      <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium mt-0.5', priority.className)}>
                        {priority.label}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell">
                    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border bg-primary/10 text-primary border-primary/20">
                      <Icon className="h-2.5 w-2.5" />
                      {c.category?.name || (c.kind === 'judicial' ? 'Judicial' : 'Administrativo')}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 hidden lg:table-cell">
                    {status && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status.color }} />
                        <span className="text-[11px] text-foreground">{status.name}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 hidden xl:table-cell">
                    <div className="flex items-center gap-1 flex-wrap max-w-[180px]">
                      {cardTags.slice(0, 3).map((tag) => (
                        <span
                          key={tag.id}
                          className="text-[9px] px-1.5 py-0.5 rounded truncate max-w-[80px]"
                          style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {cardTags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{cardTags.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 hidden lg:table-cell">
                    {stats && stats.total > 0 ? (
                      <div className="flex items-center gap-1.5 min-w-[100px]">
                        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.max(progress, 2)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums inline-flex items-center gap-0.5">
                          <ListTodo className="h-2.5 w-2.5" />
                          {stats.done}/{stats.total}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell">
                    {dueBadge || <span className="text-[11px] text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 hidden xl:table-cell">
                    {c.assignee?.full_name ? (
                      <span className="text-[11px] text-foreground truncate">{c.assignee.full_name}</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(c.opened_at), { locale: ptBR, addSuffix: false })}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
