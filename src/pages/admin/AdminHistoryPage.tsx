import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminOverview } from '@/hooks/useAdminDashboard';
import { TrendingUp, Building2, Users, MessageSquare, Phone } from 'lucide-react';

export default function AdminHistoryPage() {
  const { data, isLoading } = useAdminOverview();
  const stats = data?.stats;
  const orgs = data?.organizations || [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Histórico</h1>
          <p className="text-muted-foreground mt-1">Evolução e métricas históricas da plataforma</p>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { title: 'Organizações', value: stats?.total_organizations, icon: Building2 },
            { title: 'Usuários', value: stats?.total_users, icon: Users },
            { title: 'Conversas', value: stats?.total_conversations, icon: MessageSquare },
            { title: 'Instâncias', value: stats?.total_instances, icon: Phone },
          ].map(({ title, value, icon: Icon }) => (
            <Card key={title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-8 w-16" /> : (
                  <div className="text-2xl font-bold">{(value || 0).toLocaleString('pt-BR')}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Timeline of org creation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-primary" />
              Timeline de Organizações
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : orgs.length > 0 ? (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-4">
                  {orgs
                    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((org: any) => (
                      <div key={org.id} className="flex items-center gap-4 pl-2">
                        <div className="h-5 w-5 rounded-full bg-primary/20 border-2 border-primary flex-shrink-0 z-10" />
                        <div className="flex-1 flex items-center justify-between py-2">
                          <div>
                            <p className="font-medium text-foreground">{org.name}</p>
                            <p className="text-xs text-muted-foreground">{org.slug}</p>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {new Date(org.created_at).toLocaleDateString('pt-BR', {
                              day: '2-digit', month: 'short', year: 'numeric'
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">Nenhum dado histórico disponível.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}