import { MainLayout } from '@/components/layout/MainLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { ConversationsChart } from '@/components/dashboard/ConversationsChart';
import { ResolutionChart } from '@/components/dashboard/ResolutionChart';
import { RecentConversations } from '@/components/dashboard/RecentConversations';
import { AgentPerformance } from '@/components/dashboard/AgentPerformance';
import { useDashboardMetrics } from '@/hooks/useDashboardData';
import { MessageSquare, Clock, Bot, ThumbsUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const Index = () => {
  const { data: metrics, isLoading } = useDashboardMetrics();

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

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <RecentConversations />
        <AgentPerformance />
      </div>
    </MainLayout>
  );
};

export default Index;
