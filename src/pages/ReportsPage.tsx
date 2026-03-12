import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Download,
  TrendingUp,
  MessageSquare,
  Clock,
  Users,
  Bot,
  BarChart3,
  PieChart,
  Activity
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart as RePieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  useReportsMetrics,
  useConversationsByDay,
  useReportsStatusDistribution,
  useReportsAgentPerformance,
} from '@/hooks/useDashboardData';
import { usePipelines } from '@/hooks/usePipelines';
import { usePipelineStageDistribution, useTeamPerformanceByPipeline } from '@/hooks/usePipelineStats';
import { GitBranch, Zap } from 'lucide-react';

export default function ReportsPage() {
  const [period, setPeriod] = useState('7d');
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const { data: pipelines = [] } = usePipelines();
  const { data: stageData = [], isLoading: loadingStages } = usePipelineStageDistribution(selectedPipelineId);
  const { data: teamByPipeline = [], isLoading: loadingTeamPipeline } = useTeamPerformanceByPipeline(selectedPipelineId);
  
  const { data: metrics, isLoading: loadingMetrics } = useReportsMetrics(period);
  const { data: convByDay = [], isLoading: loadingConvByDay } = useConversationsByDay(period);
  const { data: statusData = [], isLoading: loadingStatus } = useReportsStatusDistribution(period);
  const { data: agentData = [], isLoading: loadingAgents } = useReportsAgentPerformance(period);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <MainLayout 
      title="Relatórios" 
      subtitle="Análise detalhada do desempenho"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Tabs defaultValue="overview" className="w-full">
            <div className="flex items-center justify-between mb-6">
              <TabsList className="bg-muted">
                <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                <TabsTrigger value="conversations">Conversas</TabsTrigger>
                <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
                <TabsTrigger value="agents">Agentes</TabsTrigger>
              </TabsList>
              
              <div className="flex items-center gap-3">
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hoje</SelectItem>
                    <SelectItem value="7d">Últimos 7 dias</SelectItem>
                    <SelectItem value="30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="90d">Últimos 90 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TabsContent value="overview" className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {loadingMetrics ? (
                  <>
                    <Skeleton className="h-28 rounded-xl" />
                    <Skeleton className="h-28 rounded-xl" />
                    <Skeleton className="h-28 rounded-xl" />
                    <Skeleton className="h-28 rounded-xl" />
                  </>
                ) : (
                  <>
                    <Card className="bg-card border-border">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Total de Conversas</p>
                            <p className="text-2xl font-bold text-foreground">{metrics?.totalConversations || 0}</p>
                          </div>
                          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                            <MessageSquare className="h-6 w-6 text-primary" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-card border-border">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Total de Mensagens</p>
                            <p className="text-2xl font-bold text-foreground">{metrics?.totalMessages || 0}</p>
                          </div>
                          <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <Activity className="h-6 w-6 text-blue-500" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-card border-border">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Atendidos por IA</p>
                            <p className="text-2xl font-bold text-foreground">{metrics?.aiPercentage || 0}%</p>
                          </div>
                          <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <Bot className="h-6 w-6 text-purple-500" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-card border-border">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">Agentes Ativos</p>
                            <p className="text-2xl font-bold text-foreground">{agentData.length}</p>
                          </div>
                          <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                            <Users className="h-6 w-6 text-green-500" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Volume de Mensagens
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingConvByDay ? (
                      <Skeleton className="w-full h-[300px]" />
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={convByDay}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                              color: 'hsl(var(--foreground))',
                            }}
                            labelStyle={{ color: 'hsl(var(--foreground))' }}
                            itemStyle={{ color: 'hsl(var(--foreground))' }}
                          />
                          <Bar dataKey="ia" name="IA" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="humano" name="Humano" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <PieChart className="h-5 w-5" />
                      Status das Conversas
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingStatus ? (
                      <Skeleton className="w-full h-[300px]" />
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <RePieChart>
                          <Pie
                            data={statusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {statusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px'
                            }} 
                            formatter={(value: number) => [`${value}%`, '']}
                          />
                          <Legend />
                        </RePieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="conversations" className="space-y-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Volume de Mensagens por Dia</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingConvByDay ? (
                    <Skeleton className="w-full h-[400px]" />
                  ) : (
                    <ResponsiveContainer width="100%" height={400}>
                      <AreaChart data={convByDay}>
                        <defs>
                          <linearGradient id="reportAiGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(234 89% 54%)" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(234 89% 54%)" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="reportHumanGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }} 
                        />
                        <Area type="monotone" dataKey="ia" name="IA" stroke="hsl(234 89% 54%)" strokeWidth={2} fill="url(#reportAiGrad)" />
                        <Area type="monotone" dataKey="humano" name="Humano" stroke="hsl(142 71% 45%)" strokeWidth={2} fill="url(#reportHumanGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Pipeline Tab */}
            <TabsContent value="pipeline" className="space-y-6">
              <div className="flex items-center gap-3 mb-4">
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

              {selectedPipelineId ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="bg-card border-border">
                    <CardHeader>
                      <CardTitle className="text-foreground">Distribuição por Estágio</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loadingStages ? (
                        <Skeleton className="w-full h-[300px]" />
                      ) : stageData.length === 0 ? (
                        <p className="text-center py-8 text-muted-foreground">Nenhum dado</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={stageData} layout="vertical" margin={{ left: 20 }}>
                            <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                            <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={100} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
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
                    </CardContent>
                  </Card>

                  <Card className="bg-card border-border">
                    <CardHeader>
                      <CardTitle className="text-foreground">Performance por Equipe</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loadingTeamPipeline ? (
                        <div className="space-y-4">
                          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                        </div>
                      ) : teamByPipeline.length === 0 ? (
                        <p className="text-center py-8 text-muted-foreground">Nenhum atendimento registrado</p>
                      ) : (
                        <div className="space-y-3">
                          {teamByPipeline.map((member) => (
                            <div key={member.id} className="p-3 rounded-xl bg-muted/50 border border-border">
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
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card className="bg-card border-border p-12 text-center">
                  <GitBranch className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-30" />
                  <p className="text-muted-foreground">Selecione um pipeline acima para ver os dados</p>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="agents" className="space-y-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Performance dos Agentes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingAgents ? (
                    <div className="space-y-4">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : agentData.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-2 opacity-30" />
                      <p>Nenhum atendimento registrado no período</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {agentData.map((agent, index) => (
                        <div 
                          key={agent.name}
                          className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary font-semibold">
                              {index + 1}
                            </div>
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={agent.avatarUrl || undefined} />
                              <AvatarFallback className="bg-gradient-to-br from-primary to-purple-500 text-primary-foreground font-semibold text-sm">
                                {getInitials(agent.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-foreground">{agent.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {agent.atendimentos} atendimentos
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </MainLayout>
  );
}
