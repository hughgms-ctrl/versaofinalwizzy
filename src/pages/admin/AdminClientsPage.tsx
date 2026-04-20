import React, { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  useAdminClients, useAdminPlans, useAssignPlan, useAdminOrgUsers,
  useBlockUser, useDeleteOrgUser, useAdminSettings, useToggleSignups,
  useDeleteOrganization, useAdminOrgDetails, useBlockIp, useApproveUser,
  usePendingApprovals
} from '@/hooks/useAdminDashboard';
import {
  Building2, Search, Users, Phone, HardDrive, ChevronDown, ChevronUp,
  Ban, Trash2, ShieldCheck, ShieldOff, UserPlus, Globe, Monitor,
  MapPin, AlertTriangle, Eye, CheckCircle, XCircle
} from 'lucide-react';

function UserFingerprintsDialog({ user, onClose }: { user: any; onClose: () => void }) {
  const blockIp = useBlockIp();
  const fingerprints = user?.fingerprints || [];

  return (
    <Dialog open={!!user} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            Fingerprints de {user?.name || user?.email}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-3 py-2">
            {fingerprints.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum fingerprint registrado para este usuário.
              </p>
            ) : (
              fingerprints.map((fp: any) => {
                const browser = fp.browser_data || {};
                const location = fp.location_data || {};
                return (
                  <div key={fp.id} className="p-3 border rounded-lg text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(fp.created_at).toLocaleString('pt-BR')}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-destructive"
                        onClick={() => blockIp.mutate({ ip_address: fp.ip_address, reason: `Bloqueado via fingerprint do usuário ${user?.name || user?.email}` })}
                        disabled={blockIp.isPending || !fp.ip_address}
                      >
                        <Ban className="h-3 w-3 mr-1" />
                        Bloquear IP
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">IP:</span>
                        <span className="font-mono text-xs">{fp.ip_address || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Navegador:</span>
                        <span className="truncate">{browser.browser || fp.user_agent?.split('/')[0] || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Local:</span>
                        <span>{location.city ? `${location.city}, ${location.region || location.country || ''}` : '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">OS:</span>
                        <span>{browser.os || browser.platform || '—'}</span>
                      </div>
                      {browser.timezone && (
                        <div className="flex items-center gap-1.5 col-span-2">
                          <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Timezone:</span>
                          <span>{browser.timezone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function OrgUsersRow({ orgId }: { orgId: string }) {
  const { data, isLoading } = useAdminOrgUsers(orgId);
  const blockUser = useBlockUser();
  const deleteUser = useDeleteOrgUser();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [fpTarget, setFpTarget] = useState<any | null>(null);

  if (isLoading) return (
    <TableRow>
      <TableCell colSpan={8} className="bg-muted/30 p-4">
        <Skeleton className="h-8 w-full" />
      </TableCell>
    </TableRow>
  );

  const users = data?.users || [];

  return (
    <>
      <TableRow>
        <TableCell colSpan={8} className="bg-muted/30 p-0">
          <div className="px-6 py-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Usuários ({users.length})</p>
            <div className="space-y-1">
              {users.map((u: any) => (
                <div key={u.user_id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={u.avatar_url || ''} />
                      <AvatarFallback className="text-xs">{(u.name || '?')[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{u.name || 'Sem nome'}</span>
                        <Badge variant={u.role === 'owner' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                          {u.role}
                        </Badge>
                        {u.is_blocked && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Bloqueado</Badge>
                        )}
                        {u.fingerprints?.length > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {u.fingerprints.length} FP
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Ver fingerprints"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFpTarget(u);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {u.role !== 'platform_admin' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={u.is_blocked ? 'text-green-600 hover:text-green-700' : 'text-orange-600 hover:text-orange-700'}
                          onClick={(e) => {
                            e.stopPropagation();
                            blockUser.mutate({ user_id: u.user_id, block: !u.is_blocked });
                          }}
                          disabled={blockUser.isPending}
                        >
                          {u.is_blocked ? <ShieldCheck className="h-4 w-4 mr-1" /> : <ShieldOff className="h-4 w-4 mr-1" />}
                          {u.is_blocked ? 'Desbloquear' : 'Bloquear'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({ id: u.user_id, name: u.name || u.email });
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Excluir
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">Nenhum usuário encontrado.</p>
              )}
            </div>
          </div>
        </TableCell>
      </TableRow>

      <UserFingerprintsDialog user={fpTarget} onClose={() => setFpTarget(null)} />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? Esta ação é irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deleteUser.mutate({ user_id: deleteTarget.id });
                  setDeleteTarget(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function OrgDetailDialog({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { data, isLoading } = useAdminOrgDetails(orgId);
  const blockIp = useBlockIp();

  if (isLoading) {
    return (
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader><DialogTitle>Detalhes da Organização</DialogTitle></DialogHeader>
        <div className="space-y-3 py-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </DialogContent>
    );
  }

  const org = data?.organization;
  const fingerprints = data?.fingerprints || [];
  const sharedOrgs = data?.shared_ip_organizations || [];
  const blockedIps = data?.blocked_ips || [];
  const users = data?.users || [];

  return (
    <DialogContent className="max-w-2xl max-h-[85vh]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          {org?.name}
        </DialogTitle>
      </DialogHeader>
      <ScrollArea className="max-h-[65vh] pr-4">
        <div className="space-y-6 py-2">
          {/* Org info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Slug</p>
              <p className="font-medium">{org?.slug}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Criado em</p>
              <p className="font-medium">{org?.created_at ? new Date(org.created_at).toLocaleString('pt-BR') : '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Timezone</p>
              <p className="font-medium">{org?.timezone || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Usuários</p>
              <p className="font-medium">{users.length}</p>
            </div>
          </div>

          <Separator />

          {/* Alerts - shared IPs */}
          {sharedOrgs.length > 0 && (
            <div className="p-4 border border-destructive/30 bg-destructive/5 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <h3 className="font-semibold text-destructive">⚠️ Alerta de Triangulação</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                IPs desta organização foram encontrados em outras organizações:
              </p>
              <div className="space-y-2">
                {sharedOrgs.map((so: any) => (
                  <div key={so.id} className="flex items-center justify-between p-2 bg-card rounded border">
                    <div>
                      <p className="text-sm font-medium">{so.name}</p>
                      <p className="text-xs text-muted-foreground">
                        IPs compartilhados: {so.shared_ips?.join(', ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Criada em: {new Date(so.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fingerprints */}
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Fingerprints ({fingerprints.length})
            </h3>
            {fingerprints.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum fingerprint registrado.</p>
            ) : (
              <div className="space-y-3">
                {fingerprints.map((fp: any) => {
                  const isBlocked = blockedIps.some((b: any) => b.ip_address === fp.ip_address);
                  const browser = fp.browser_data || {};
                  const location = fp.location_data || {};
                  return (
                    <div key={fp.id} className={`p-3 border rounded-lg text-sm ${isBlocked ? 'border-destructive/30 bg-destructive/5' : ''}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(fp.created_at).toLocaleString('pt-BR')}
                        </span>
                        {isBlocked ? (
                          <Badge variant="destructive" className="text-[10px]">IP Bloqueado</Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-destructive"
                            onClick={() => blockIp.mutate({ ip_address: fp.ip_address, reason: `Bloqueado via detalhes da org ${org?.name}` })}
                            disabled={blockIp.isPending}
                          >
                            <Ban className="h-3 w-3 mr-1" />
                            Bloquear IP
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-1.5">
                          <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">IP:</span>
                          <span className="font-mono text-xs">{fp.ip_address || '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Navegador:</span>
                          <span className="truncate">{browser.browser || fp.user_agent?.split('/')[0] || '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Local:</span>
                          <span>{location.city ? `${location.city}, ${location.region || location.country || ''}` : '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">OS:</span>
                          <span>{browser.os || browser.platform || '—'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </DialogContent>
  );
}

function PendingApprovalsSection() {
  const { data, isLoading } = usePendingApprovals();
  const approveUser = useApproveUser();
  const blockUser = useBlockUser();

  const pending = data?.pending || [];

  if (isLoading) return null;
  if (pending.length === 0) return null;

  return (
    <Card className="border-orange-500/30 bg-orange-500/5">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          <h3 className="font-semibold">Aprovações Pendentes ({pending.length})</h3>
        </div>
        <div className="space-y-2">
          {pending.map((p: any) => (
            <div key={p.user_id} className="flex items-center justify-between p-3 bg-card rounded-lg border">
              <div>
                <p className="font-medium text-sm">{p.name || p.email}</p>
                <p className="text-xs text-muted-foreground">{p.email} · {p.organization_name}</p>
                {p.fingerprint && (
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {p.fingerprint.ip_address || '—'}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {p.fingerprint.location_data?.city || '—'}
                    </span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Cadastro: {new Date(p.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-green-600 hover:text-green-700"
                  onClick={() => approveUser.mutate({ user_id: p.user_id })}
                  disabled={approveUser.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Aprovar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => blockUser.mutate({ user_id: p.user_id, block: true })}
                  disabled={blockUser.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Rejeitar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminClientsPage() {
  const { data, isLoading } = useAdminClients();
  const { data: plansData } = useAdminPlans();
  const { data: settingsData } = useAdminSettings();
  const assignPlan = useAssignPlan();
  const toggleSignups = useToggleSignups();
  const deleteOrg = useDeleteOrganization();
  const [search, setSearch] = useState('');
  const [assignDialog, setAssignDialog] = useState<{ orgId: string; orgName: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ orgId: string; orgName: string } | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [detailOrgId, setDetailOrgId] = useState<string | null>(null);

  const allowSignups = settingsData?.settings?.allow_signups ?? true;

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
          <div className="flex items-center gap-3 bg-card border rounded-lg px-4 py-3">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <p className="font-medium">Cadastros automáticos</p>
              <p className="text-xs text-muted-foreground">{allowSignups ? 'Novos usuários podem se cadastrar' : 'Apenas você libera novos usuários'}</p>
            </div>
            <Switch
              checked={allowSignups}
              onCheckedChange={(checked) => toggleSignups.mutate(checked)}
              disabled={toggleSignups.isPending}
            />
          </div>
        </div>

        {/* Pending approvals */}
        <PendingApprovalsSection />

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
                    <React.Fragment key={org.id}>
                      <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandedOrg(expandedOrg === org.id ? null : org.id)}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {expandedOrg === org.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            <div>
                              <p className="font-medium">{org.name}</p>
                              <p className="text-xs text-muted-foreground">{org.slug}</p>
                            </div>
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
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDetailOrgId(org.id)}
                              title="Ver detalhes"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setAssignDialog({ orgId: org.id, orgName: org.name });
                                setSelectedPlanId(org.plan?.id || '');
                              }}
                            >
                              Plano
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteConfirm({ orgId: org.id, orgName: org.name })}
                              disabled={deleteOrg.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedOrg === org.id && (
                        <OrgUsersRow orgId={org.id} />
                      )}
                    </React.Fragment>
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

      {/* Org Detail Dialog */}
      <Dialog open={!!detailOrgId} onOpenChange={() => setDetailOrgId(null)}>
        {detailOrgId && <OrgDetailDialog orgId={detailOrgId} onClose={() => setDetailOrgId(null)} />}
      </Dialog>

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
              disabled={!selectedPlanId || assignPlan.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Organização permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Todos os dados da organização "{deleteConfirm?.orgName}",
              incluindo mensagens, contatos e contas de usuários, serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirm) {
                  deleteOrg.mutate(deleteConfirm.orgId);
                  setDeleteConfirm(null);
                }
              }}
            >
              Sim, excluir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}