import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ConversationsChart } from '@/components/dashboard/ConversationsChart';
import { ResolutionChart } from '@/components/dashboard/ResolutionChart';
import { RecentConversations } from '@/components/dashboard/RecentConversations';
import { AgentPerformance } from '@/components/dashboard/AgentPerformance';
import { useDashboardMetrics } from '@/hooks/useDashboardData';
import { usePipelines } from '@/hooks/usePipelines';
import { usePipelineStageDistribution, useTeamPerformanceByPipeline } from '@/hooks/usePipelineStats';
import { MessageSquare, Clock, Bot, ThumbsUp, GitBranch } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Zap } from 'lucide-react';

const Index = () => {
  const { data: metrics, isLoading } = useDashboardMetrics();
  const { data: pipelines = [] } = usePipelines();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const { data: stageData = [], isLoading: loadingStages } = usePipelineStageDistribution(selectedPipelineId);
  const { data: teamByPipeline = [], isLoading: loadingTeamPipeline } = useTeamPerformanceByPipeline(selectedPipelineId);

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <MainLayout 
      title="Dashboard" 
      subtitle="Visão geral do seu atendimento"
      showSearch={true}
    >
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
        {isLoading ? (
          <>
            <Skeleton className="h-24 md:h-32 rounded-xl" />
            <Skeleton className="h-24 md:h-32 rounded-xl" />
            <Skeleton className="h-24 md:h-32 rounded-xl" />
            <Skeleton className="h-24 md:h-32 rounded-xl" />
          </>
        ) : (
          <>
            <MetricCard
              title="Conversas Hoje"
              value={metrics?.conversationsToday || 0}
              subtitle={`${metrics?.resolvedToday || 0} resolvidas`}
              icon={MessageSquare}
              variant="primary"
            />
            <MetricCard
              title="Em Aberto"
              value={metrics?.openConversations || 0}
              subtitle="aguardando atendimento"
              icon={Clock}
              variant="warning"
            />
            <MetricCard
              title="Atendimento por IA"
              value={`${metrics?.aiHandledPercentage || 0}%`}
              subtitle="das mensagens"
              icon={Bot}
              variant="primary"
            />
            <MetricCard
              title="Mensagens Hoje"
              value={metrics?.totalMessages || 0}
              subtitle="enviadas e recebidas"
              icon={ThumbsUp}
              variant="success"
            />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-4 md:mb-6">
        <div className="lg:col-span-2">
          <ConversationsChart />
        </div>
        <ResolutionChart />
      </div>

      {/* Pipeline Stats */}
      {pipelines.length > 0 && (
        <div className="mb-4 md:mb-6 space-y-4">
          <div className="flex items-center gap-3">
            <GitBranch className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground">Visão por Pipeline</h3>
            <Select
              value={selectedPipelineId || ''}
              onValueChange={(v) => setSelectedPipelineId(v || null)}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Selecionar pipeline..." />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPipelineId && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              {/* Stage Distribution Chart */}
              <div className="metric-card">
                <div className="metric-card-gradient" />
                <div className="relative">
                  <h3 className="text-lg font-semibold text-foreground mb-1">Distribuição por Estágio</h3>
                  <p className="text-sm text-muted-foreground mb-4">Contatos em cada etapa do pipeline</p>
                  {loadingStages ? (
                    <Skeleton className="w-full h-[250px]" />
                  ) : stageData.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">Nenhum dado</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={stageData} layout="vertical" margin={{ left: 20 }}>
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={100} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            color: 'hsl(var(--foreground))',
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                          itemStyle={{ color: 'hsl(var(--foreground))' }}
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

              {/* Team Performance by Pipeline */}
              <div className="metric-card">
                <div className="metric-card-gradient" />
                <div className="relative">
                  <h3 className="text-lg font-semibold text-foreground mb-1">Performance por Equipe</h3>
                  <p className="text-sm text-muted-foreground mb-4">Atendimentos neste pipeline</p>
                  {loadingTeamPipeline ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                    </div>
                  ) : teamByPipeline.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">Nenhum atendimento registrado</p>
                  ) : (
                    <div className="space-y-3">
                      {teamByPipeline.map((member) => (
                        <div key={member.id} className="p-3 rounded-xl bg-secondary/50 border border-border/50">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={member.avatar_url || undefined} />
                              <AvatarFallback className="bg-gradient-to-br from-primary to-purple-500 text-primary-foreground font-semibold text-xs">
                                {getInitials(member.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">{member.name}</p>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Zap className="h-3 w-3 text-primary" />
                                <span>{member.conversationsHandled} conversas</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <RecentConversations />
        <AgentPerformance />
      </div>
    </MainLayout>
  );
};

export default Index;
