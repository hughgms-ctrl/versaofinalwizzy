import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminClients, useAdminPlans, useAssignPlan } from '@/hooks/useAdminDashboard';
import { Building2, Search, Users, Phone, HardDrive } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function AdminClientsPage() {
  const { data, isLoading } = useAdminClients();
  const { data: plansData } = useAdminPlans();
  const assignPlan = useAssignPlan();
  const [search, setSearch] = useState('');
  const [assignDialog, setAssignDialog] = useState<{ orgId: string; orgName: string } | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const orgs = (data?.organizations || []).filter((org: any) =>
    !search || org.name?.toLowerCase().includes(search.toLowerCase()) || org.slug?.toLowerCase().includes(search.toLowerCase())
  );

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Clientes</h1>
            <p className="text-muted-foreground mt-1">
              {isLoading ? '...' : `${orgs.length} organizações cadastradas`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou slug..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organização</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead className="text-center">Usuários</TableHead>
                    <TableHead className="text-center">Instâncias</TableHead>
                    <TableHead className="text-center">Conversas</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((org: any) => (
                    <TableRow key={org.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{org.name}</p>
                          <p className="text-xs text-muted-foreground">{org.slug}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {org.plan ? (
                          <Badge variant="secondary">{org.plan.name}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Sem plano</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {org.user_count}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          {org.active_instances}/{org.instance_count}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{org.conversation_count}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                          {formatBytes(org.storage_used_bytes || 0)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(org.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAssignDialog({ orgId: org.id, orgName: org.name });
                            setSelectedPlanId(org.plan?.slug || '');
                          }}
                        >
                          Plano
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {orgs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Nenhuma organização encontrada.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Assign Plan Dialog */}
      <Dialog open={!!assignDialog} onOpenChange={() => setAssignDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir Plano — {assignDialog?.orgName}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um plano" />
              </SelectTrigger>
              <SelectContent>
                {(plansData?.plans || []).map((plan: any) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} — R$ {plan.price_monthly}/mês
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (assignDialog && selectedPlanId) {
                  assignPlan.mutate({ organization_id: assignDialog.orgId, plan_id: selectedPlanId });
                  setAssignDialog(null);
                }
              }}
              disabled={!selectedPlanId}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}