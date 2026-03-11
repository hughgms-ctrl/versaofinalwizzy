import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminOverview } from '@/hooks/useAdminDashboard';
import {
  Building2, Users, MessageSquare, Phone,
  AlertTriangle, CheckCircle2, Database, Bot
} from 'lucide-react';

export default function AdminPage() {
  const { data, isLoading } = useAdminOverview();
  const stats = data?.stats;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Visão Geral</h1>
          <p className="text-muted-foreground mt-1">Dashboard administrativo da plataforma Wizzy</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Organizações"
            value={isLoading ? undefined : String(stats?.total_organizations || 0)}
            description="Total de clientes"
            icon={Building2}
          />
          <MetricCard
            title="Usuários"
            value={isLoading ? undefined : String(stats?.total_users || 0)}
            description="Usuários cadastrados"
            icon={Users}
          />
          <MetricCard
            title="Conversas"
            value={isLoading ? undefined : formatNumber(stats?.total_conversations || 0)}
            description="Total de conversas"
            icon={MessageSquare}
          />
          <MetricCard
            title="Mensagens"
            value={isLoading ? undefined : formatNumber(stats?.total_messages || 0)}
            description="Total de mensagens"
            icon={Database}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            title="Contatos"
            value={isLoading ? undefined : formatNumber(stats?.total_contacts || 0)}
            description="Total de contatos"
            icon={Users}
          />
          <MetricCard
            title="Instâncias WhatsApp"
            value={isLoading ? undefined : String(stats?.total_instances || 0)}
            description={`${stats?.active_instances || 0} ativas`}
            icon={Phone}
          />
          <MetricCard
            title="Custo IA (mês)"
            value="—"
            description="Estimativa de gasto"
            icon={Bot}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
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
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
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

        {/* Recent orgs */}
        {data?.organizations && data.organizations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Organizações Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.organizations.slice(0, 5).map((org: any) => (
                  <div key={org.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="font-medium text-foreground">{org.name}</p>
                      <p className="text-xs text-muted-foreground">{org.slug}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(org.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function MetricCard({ title, value, description, icon: Icon }: {
  title: string; value: string | undefined; description: string; icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {value !== undefined ? (
          <div className="text-2xl font-bold text-foreground">{value}</div>
        ) : (
          <Skeleton className="h-8 w-20" />
        )}
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function StatusItem({ label, status }: { label: string; status: 'online' | 'offline' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <Badge variant={status === 'online' ? 'default' : 'destructive'} className="text-xs">
        {status === 'online' ? '● Online' : '● Offline'}
      </Badge>
    </div>
  );
}