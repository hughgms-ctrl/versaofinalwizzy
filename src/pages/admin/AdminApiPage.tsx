import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminApi } from '@/hooks/useAdminDashboard';
import { Key, Activity, Building2 } from 'lucide-react';

export default function AdminApiPage() {
  const { data, isLoading } = useAdminApi();

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">API & Custos</h1>
          <p className="text-muted-foreground mt-1">Monitoramento de uso de APIs e custos de IA</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-5 w-5 text-primary" />
                Requisições IA (últimos 30 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-24" />
              ) : (
                <div className="text-3xl font-bold text-foreground">
                  {(data?.total_requests_30d || 0).toLocaleString('pt-BR')}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Execuções de agentes IA</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Key className="h-5 w-5 text-primary" />
                Custo Estimado
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-24" />
              ) : (
                <div className="text-3xl font-bold text-foreground">
                  ~US$ {((data?.total_requests_30d || 0) * 0.003).toFixed(2)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Baseado em ~$0.003/requisição (estimativa)</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-primary" />
              Consumo por Organização
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organização</TableHead>
                    <TableHead className="text-right">Requisições (30d)</TableHead>
                    <TableHead className="text-right">Custo Est.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.usage_by_org || []).map((item: any) => (
                    <TableRow key={item.organization_id}>
                      <TableCell className="font-medium">{item.organization_name}</TableCell>
                      <TableCell className="text-right">{item.request_count.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        ~US$ {(item.request_count * 0.003).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!data?.usage_by_org || data.usage_by_org.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        Nenhum consumo registrado nos últimos 30 dias.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}