import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ConversationsChart } from '@/components/dashboard/ConversationsChart';
import { ResolutionChart } from '@/components/dashboard/ResolutionChart';
import { RecentConversations } from '@/components/dashboard/RecentConversations';
import { AgentPerformance } from '@/components/dashboard/AgentPerformance';
import { FunnelChart } from '@/components/dashboard/FunnelChart';
import { useDashboardMetrics } from '@/hooks/useDashboardData';
import { usePipelines } from '@/hooks/usePipelines';
import { usePipelineStageDistribution, useTeamPerformanceByPipeline } from '@/hooks/usePipelineStats';
import { useCanAccessModule } from '@/hooks/useUserPermissions';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  MessageSquare,
  Clock,
  Bot,
  Hash,
  GitBranch,
  Zap,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { DashboardPeriodProvider, useDashboardPeriod } from '@/contexts/DashboardPeriodContext';
import { DashboardPeriodSelector } from '@/components/dashboard/DashboardPeriodSelector';
import { trackEntryEvent } from '@/lib/entryFlow';

function SectionHeading({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </h2>
      {sub && <span className="text-xs text-muted-foreground/60">{sub}</span>}
      <div className="flex-1 border-t border-border" />
    </div>
  );
}

function PipelineSection() {
  const { data: allPipelines = [] } = usePipelines();
  const { selectedWorkspaceId } = useWorkspaceContext();

  const pipelines = useMemo(() => {
    if (!selectedWorkspaceId) return allPipelines;
    return allPipelines.filter((p: any) => {
      const ws = Array.isArray(p.workspace_ids) ? p.workspace_ids : [];
      return ws.includes(selectedWorkspaceId);
    });
  }, [allPipelines, selectedWorkspaceId]);

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);

  useEffect(() => {
    if (pipelines.length === 0) {
      if (selectedPipelineId !== null) setSelectedPipelineId(null);
      return;
    }

    const stillVisible = pipelines.some((p) => p.id === selectedPipelineId);
    if (!stillVisible) setSelectedPipelineId(pipelines[0].id);
  }, [pipelines, selectedPipelineId]);

  const { data: stageData = [], isLoading: loadingStages } = usePipelineStageDistribution(selectedPipelineId);
  const { data: teamByPipeline = [], isLoading: loadingTeamPipeline } = useTeamPerformanceByPipeline(selectedPipelineId);

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  if (pipelines.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Pipeline
          </h2>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          <Select
            value={selectedPipelineId || ''}
            onValueChange={(v) => setSelectedPipelineId(v || null)}
          >
            <SelectTrigger className="h-8 w-[200px] rounded-lg border-border text-xs">
              <SelectValue placeholder="Selecionar pipeline..." />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-sm">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedPipelineId && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-4 md:p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Distribuição por Estágio
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">Contatos em cada etapa</p>
            </div>
            <div className="p-4 md:p-5">
              {loadingStages ? (
                <Skeleton className="h-[220px] w-full rounded-lg" />
              ) : stageData.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <GitBranch className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Nenhum contato neste pipeline ainda</p>
                  <p className="text-xs text-muted-foreground/70">
                    Adicione contatos ao pipeline para ver a distribuição por estágio.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stageData} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis
                      type="number"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      width={90}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: 'hsl(var(--foreground))',
                      }}
                      formatter={(value: number) => {
                        const total = stageData.reduce((sum, s) => sum + s.value, 0);
                        const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                        return [`${value} contatos (${pct}%)`, ''];
                      }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {stageData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-4 md:p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Equipe neste Pipeline
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">Atendimentos registrados</p>
            </div>
            <div className="p-4 md:p-5">
              {loadingTeamPipeline ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <Skeleton className="h-4 flex-1 rounded" />
                    </div>
                  ))}
                </div>
              ) : teamByPipeline.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <CheckCircle2 className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum atendimento registrado neste pipeline
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {teamByPipeline.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5"
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={member.avatar_url || undefined} />
                        <AvatarFallback className="bg-gradient-to-br from-primary to-violet-500 text-[11px] font-semibold text-primary-foreground">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Zap className="h-3 w-3 text-primary" />
                          <span>{member.conversationsHandled} conversas</span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const IndexInner = () => {
  const { canAccess, isLoading: accessLoading } = useCanAccessModule('dashboard');
  const { range } = useDashboardPeriod();
  const { data: metrics, isLoading } = useDashboardMetrics(range);

  useEffect(() => {
    trackEntryEvent('dashboard_accessed').catch(() => undefined);
  }, []);

  if (!accessLoading && !canAccess) {
    return <Navigate to="/pipeline" replace />;
  }

  const openConversations = metrics?.openConversations ?? 0;

  return (
    <MainLayout
      title="Dashboard"
      subtitle="Visão geral do seu atendimento"
      showSearch={true}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Dados atualizados em tempo real
        </p>
        <DashboardPeriodSelector />
      </div>

      <section className="mb-6">
        <SectionHeading>Visão Geral</SectionHeading>
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          {isLoading ? (
            <>
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </>
          ) : (
            <>
              <MetricCard
                title="Conversas Hoje"
                value={metrics?.conversationsToday ?? 0}
                subtitle={`${metrics?.resolvedToday ?? 0} resolvidas`}
                icon={MessageSquare}
                variant="primary"
              />
              <MetricCard
                title="Em Aberto"
                value={openConversations}
                subtitle="aguardando atendimento"
                icon={Clock}
                variant={openConversations > 30 ? 'danger' : openConversations > 10 ? 'warning' : 'success'}
              />
              <MetricCard
                title="Atendimento por IA"
                value={`${metrics?.aiHandledPercentage ?? 0}%`}
                subtitle="das mensagens"
                icon={Bot}
                variant="primary"
              />
              <MetricCard
                title="Mensagens Hoje"
                value={metrics?.totalMessages ?? 0}
                subtitle="enviadas e recebidas"
                icon={Hash}
                variant="success"
              />
            </>
          )}
        </div>
      </section>

      <section className="mb-6">
        <SectionHeading>Tendências</SectionHeading>
        <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-3">
          <div className="min-h-[360px] lg:col-span-2">
            <ConversationsChart />
          </div>
          <ResolutionChart />
        </div>
      </section>

      <section className="mb-6">
        <SectionHeading>Funil de Conversão</SectionHeading>
        <FunnelChart />
      </section>

      <section className="mb-6">
        <PipelineSection />
      </section>

      <section>
        <SectionHeading>Atividade Recente</SectionHeading>
        <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-2">
          <RecentConversations />
          <AgentPerformance />
        </div>
      </section>
    </MainLayout>
  );
};

const Index = () => (
  <DashboardPeriodProvider>
    <IndexInner />
  </DashboardPeriodProvider>
);

export default Index;
