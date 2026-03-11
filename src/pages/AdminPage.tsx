import { MainLayout } from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard, Users, CreditCard, Key, Shield, ScrollText, TrendingUp,
  Building2, Database, Bot, AlertTriangle, CheckCircle2
} from 'lucide-react';

export default function AdminPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Painel Administrativo</h1>
          <p className="text-muted-foreground mt-1">Gerenciamento da plataforma Wizzy</p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="overview" className="gap-2">
              <LayoutDashboard className="h-4 w-4" /> Visão Geral
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-2">
              <Building2 className="h-4 w-4" /> Clientes
            </TabsTrigger>
            <TabsTrigger value="plans" className="gap-2">
              <CreditCard className="h-4 w-4" /> Planos
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-2">
              <Key className="h-4 w-4" /> API & Custos
            </TabsTrigger>
            <TabsTrigger value="governance" className="gap-2">
              <ScrollText className="h-4 w-4" /> Governança
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="h-4 w-4" /> Segurança
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <TrendingUp className="h-4 w-4" /> Histórico
            </TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                title="Organizações"
                value="—"
                description="Total de clientes"
                icon={Building2}
              />
              <MetricCard
                title="Storage Total"
                value="—"
                description="Uso de armazenamento"
                icon={Database}
              />
              <MetricCard
                title="Custo IA (mês)"
                value="—"
                description="Gasto com API de IA"
                icon={Bot}
              />
              <MetricCard
                title="MRR"
                value="—"
                description="Receita mensal recorrente"
                icon={TrendingUp}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    Alertas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Nenhum alerta no momento.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    Status da Plataforma
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <StatusItem label="Supabase" status="online" />
                    <StatusItem label="Edge Functions" status="online" />
                    <StatusItem label="WhatsApp API" status="online" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Clients */}
          <TabsContent value="clients">
            <Card>
              <CardHeader>
                <CardTitle>Organizações</CardTitle>
                <CardDescription>Gerencie todas as organizações da plataforma</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">A listagem de clientes será implementada na Fase 2.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Plans */}
          <TabsContent value="plans">
            <Card>
              <CardHeader>
                <CardTitle>Planos da Plataforma</CardTitle>
                <CardDescription>Gerencie os planos disponíveis</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">O CRUD de planos será implementado na Fase 2.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API & Costs */}
          <TabsContent value="api">
            <Card>
              <CardHeader>
                <CardTitle>Chaves de API da Plataforma</CardTitle>
                <CardDescription>Gerencie as chaves de IA usadas nos planos premium</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">O gerenciamento de chaves será implementado na Fase 3.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Governance */}
          <TabsContent value="governance">
            <Card>
              <CardHeader>
                <CardTitle>Governança & Maturidade</CardTitle>
                <CardDescription>Score de maturidade, checklist, certificação e biblioteca de prompts</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">O painel de governança será implementado na Fase 4.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Segurança</CardTitle>
                <CardDescription>Relatório de RLS, audit logs e verificações de segurança</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">O painel de segurança será implementado na Fase 4.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Ações</CardTitle>
                <CardDescription>Timeline de todas as ações administrativas</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">O histórico será implementado na Fase 4.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}

function MetricCard({ title, value, description, icon: Icon }: {
  title: string; value: string; description: string; icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function StatusItem({ label, status }: { label: string; status: 'online' | 'offline' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Badge variant={status === 'online' ? 'default' : 'destructive'} className="text-xs">
        {status === 'online' ? '● Online' : '● Offline'}
      </Badge>
    </div>
  );
}
