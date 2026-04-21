import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { OperationsBoard } from '@/components/operations/OperationsBoard';
import { OperationsListView } from '@/components/operations/OperationsListView';
import { CaseDrawer } from '@/components/operations/CaseDrawer';
import { CaseCategorySelector } from '@/components/operations/CaseCategorySelector';
import { Button } from '@/components/ui/button';
import { useCaseCategories, useCaseStatuses } from '@/hooks/useOperationsCases';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Briefcase, ListTodo, Calendar, Settings, LayoutGrid, List } from 'lucide-react';

type ViewMode = 'kanban' | 'list';

export default function OperationsPage() {
  const location = useLocation();
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  const { data: categories = [] } = useCaseCategories();
  const { data: team = [] } = useTeamMembers();

  const [categoryId, setCategoryId] = useState<string>('all');
  const [assigneeId, setAssigneeId] = useState<string>('all');
  const [statusId, setStatusId] = useState<string>('all');

  // Tipo de caso vem da própria categoria selecionada
  const selectedCategory = categories.find((c: any) => c.id === categoryId);
  const kind: 'all' | 'judicial' | 'administrative' = selectedCategory ? selectedCategory.kind : 'all';

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

  const filters = { kind, category_id: categoryId, assignee_id: assigneeId, status_id: statusId };

  return (
    <MainLayout
      title="Operacional"
      subtitle="Gestão de casos e tarefas operacionais"
      fullWidth
    >
      <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-border px-4 flex-shrink-0">
          {tabs.map((t) => (
            <Link
              key={t.href}
              to={t.href}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition',
                location.pathname === t.href
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          ))}
        </div>

        {/* Header Controls (mesmo padrão visual do Pipeline) */}
        <div className="flex items-center px-4 py-2 border-b border-border bg-muted/30 flex-shrink-0 overflow-x-auto w-full scrollbar-hide">
          <div className="flex items-center gap-3 min-w-max">
            {/* Seletor de Tipo de Caso (em destaque, como o Pipeline) */}
            <CaseCategorySelector
              categories={categories as any}
              selectedId={categoryId}
              onSelect={setCategoryId}
            />

            {/* Filtros adicionais */}
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="all">Todos responsáveis</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>

            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={statusId}
              onChange={(e) => setStatusId(e.target.value)}
            >
              <option value="all">Todos os status</option>
              {statuses.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="flex-1" />

            {/* Toggle visualização */}
            <div className="inline-flex rounded-md border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  viewMode === 'kanban'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-label="Visualizar em kanban"
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Kanban
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  viewMode === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-label="Visualizar em lista"
              >
                <List className="h-3.5 w-3.5" /> Lista
              </button>
            </div>

            <Button asChild variant="outline" size="sm">
              <Link to="/operations/templates">
                <Settings className="h-3.5 w-3.5 mr-1.5" />
                {categoryId === 'all' ? 'Configurar colunas' : 'Editar colunas'}
              </Link>
            </Button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-hidden p-4">
          {viewMode === 'kanban' ? (
            <OperationsBoard
              filters={filters}
              categoryId={categoryId === 'all' ? null : categoryId}
              onOpenCase={handleOpen}
            />
          ) : (
            <OperationsListView
              filters={filters}
              categoryId={categoryId === 'all' ? null : categoryId}
              onOpenCase={handleOpen}
            />
          )}
        </div>
      </div>

      <CaseDrawer caseId={openCaseId} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </MainLayout>
  );
}
