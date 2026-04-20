import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { OperationsBoard } from '@/components/operations/OperationsBoard';
import { CaseDrawer } from '@/components/operations/CaseDrawer';
import { Button } from '@/components/ui/button';
import { useCaseCategories, useCaseStatuses } from '@/hooks/useOperationsCases';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Briefcase, ListTodo, Calendar, Settings } from 'lucide-react';

export default function OperationsPage() {
  const location = useLocation();
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: categories = [] } = useCaseCategories();
  const { data: team = [] } = useTeamMembers();

  const [kind, setKind] = useState<'all' | 'judicial' | 'administrative'>('all');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [assigneeId, setAssigneeId] = useState<string>('all');
  const [statusId, setStatusId] = useState<string>('all');

  const { data: statuses = [] } = useCaseStatuses(categoryId === 'all' ? null : categoryId);

  const handleOpen = (id: string) => {
    setOpenCaseId(id);
    setDrawerOpen(true);
  };

  const tabs = [
    { href: '/operations', label: 'Casos', icon: Briefcase },
    { href: '/operations/tasks', label: 'Minhas Tarefas', icon: ListTodo },
    { href: '/operations/deadlines', label: 'Prazos', icon: Calendar },
    { href: '/operations/templates', label: 'Templates', icon: Settings },
  ];

  return (
    <MainLayout title="Operacional" subtitle="Gestão de casos e tarefas operacionais">
      <div className="space-y-4">
        <div className="flex gap-1 border-b">
          {tabs.map((t) => (
            <Link
              key={t.href}
              to={t.href}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition',
                location.pathname === t.href
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as any)}>
            <option value="all">Todos os tipos</option>
            <option value="judicial">Judicial</option>
            <option value="administrative">Administrativo</option>
          </select>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="all">Todas as categorias</option>
            {categories
              .filter((c: any) => kind === 'all' || c.kind === kind)
              .map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
          </select>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="all">Todos responsáveis</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
            <option value="all">Todos os status</option>
            {statuses.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <OperationsBoard
          filters={{ kind, category_id: categoryId, assignee_id: assigneeId, status_id: statusId }}
          categoryId={categoryId === 'all' ? null : categoryId}
          onOpenCase={handleOpen}
        />
      </div>

      <CaseDrawer caseId={openCaseId} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </MainLayout>
  );
}
