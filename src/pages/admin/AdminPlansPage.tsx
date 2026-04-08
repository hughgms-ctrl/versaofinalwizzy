import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { useAdminPlans, useUpdatePlan } from '@/hooks/useAdminDashboard';
import { CreditCard, Plus, Edit, Users, Check, X } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

const ALL_MODULES = [
  { value: 'conversations', label: 'Conversas' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'contacts', label: 'Contatos' },
  { value: 'flows', label: 'Fluxos' },
  { value: 'documents', label: 'Documentos' },
  { value: 'agents', label: 'Agentes IA' },
  { value: 'reports', label: 'Relatórios' },
  { value: 'campaigns', label: 'Campanhas' },
  { value: 'calendar', label: 'Agenda' },
  { value: 'orchestrator', label: 'Orquestrador' },
  { value: 'ai', label: 'Inteligência Artificial' },
  { value: 'widgets', label: 'Widgets' },
  { value: 'settings', label: 'Configurações' },
  { value: 'team', label: 'Equipe' },
  { value: 'scheduled', label: 'Agendamento' },
  { value: 'integrations', label: 'Integrações' },
];

interface PlanForm {
  id?: string;
  name: string;
  slug: string;
  price_monthly: number;
  price_yearly: number;
  max_team_members: number;
  max_conversations: number | null;
  max_ai_requests_month: number | null;
  storage_limit_bytes: number;
  ai_mode: string;
  is_active: boolean;
  allowed_modules: string[];
}

const emptyPlan: PlanForm = {
  name: '', slug: '', price_monthly: 0, price_yearly: 0, max_team_members: 3,
  max_conversations: null, max_ai_requests_month: null,
  storage_limit_bytes: 1073741824, ai_mode: 'own_api', is_active: true,
  allowed_modules: [],
};

export default function AdminPlansPage() {
  const { data, isLoading } = useAdminPlans();
  const updatePlan = useUpdatePlan();
  const [editPlan, setEditPlan] = useState<PlanForm | null>(null);

  const plans = data?.plans || [];

  const formatStorage = (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(0)} GB`;
    return `${(bytes / 1048576).toFixed(0)} MB`;
  };

  const toggleModule = (mod: string) => {
    if (!editPlan) return;
    const modules = editPlan.allowed_modules || [];
    setEditPlan({
      ...editPlan,
      allowed_modules: modules.includes(mod)
        ? modules.filter(m => m !== mod)
        : [...modules, mod],
    });
  };

  const selectAllModules = () => {
    if (!editPlan) return;
    setEditPlan({ ...editPlan, allowed_modules: ALL_MODULES.map(m => m.value) });
  };

  const deselectAllModules = () => {
    if (!editPlan) return;
    setEditPlan({ ...editPlan, allowed_modules: [] });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Planos</h1>
            <p className="text-muted-foreground mt-1">Gerenciamento de planos da plataforma</p>
          </div>
          <Button onClick={() => setEditPlan({ ...emptyPlan })}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Plano
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-64" />)}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan: any) => {
              const modules: string[] = plan.allowed_modules || [];
              return (
                <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-primary" />
                        {plan.name}
                      </CardTitle>
                      <Button variant="ghost" size="icon" onClick={() => setEditPlan({
                        id: plan.id, name: plan.name, slug: plan.slug,
                        price_monthly: plan.price_monthly,
                        price_yearly: plan.price_yearly || 0,
                        max_team_members: plan.max_team_members,
                        max_conversations: plan.max_conversations,
                        max_ai_requests_month: plan.max_ai_requests_month,
                        storage_limit_bytes: plan.storage_limit_bytes,
                        ai_mode: plan.ai_mode,
                        is_active: plan.is_active,
                        allowed_modules: modules,
                      })}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardDescription>
                      <span className="text-2xl font-bold text-foreground">R$ {plan.price_monthly}</span>
                      <span className="text-muted-foreground">/mês</span>
                      {plan.price_yearly > 0 && (
                        <span className="text-sm text-muted-foreground ml-2">
                          · R$ {plan.price_yearly}/ano
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Membros</span>
                      <span className="font-medium">{plan.max_team_members || '∞'}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Storage</span>
                      <span className="font-medium">{formatStorage(plan.storage_limit_bytes)}</span>
                    </div>

                    <Separator />

                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Módulos</p>
                      <div className="flex flex-wrap gap-1">
                        {ALL_MODULES.map(mod => {
                          const has = modules.includes(mod.value);
                          return (
                            <Badge
                              key={mod.value}
                              variant={has ? 'default' : 'outline'}
                              className={`text-xs ${!has ? 'opacity-40' : ''}`}
                            >
                              {has ? <Check className="w-3 h-3 mr-0.5" /> : <X className="w-3 h-3 mr-0.5" />}
                              {mod.label}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {plan.subscriber_count || 0} assinantes
                      </span>
                      {!plan.is_active && <Badge variant="secondary">Inativo</Badge>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit/Create Plan Dialog */}
      <Dialog open={!!editPlan} onOpenChange={() => setEditPlan(null)}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editPlan?.id ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
          </DialogHeader>
          {editPlan && (
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-5 py-2">
                {/* Basic info */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nome</Label>
                    <Input value={editPlan.name} onChange={e => setEditPlan({ ...editPlan, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Slug</Label>
                    <Input value={editPlan.slug} onChange={e => setEditPlan({ ...editPlan, slug: e.target.value })} />
                  </div>
                </div>

                {/* Pricing */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Preço mensal (R$)</Label>
                    <Input type="number" value={editPlan.price_monthly} onChange={e => setEditPlan({ ...editPlan, price_monthly: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Preço anual (R$)</Label>
                    <Input type="number" value={editPlan.price_yearly} onChange={e => setEditPlan({ ...editPlan, price_yearly: Number(e.target.value) })} />
                  </div>
                </div>

                {/* Limits */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Máx. membros</Label>
                    <Input type="number" value={editPlan.max_team_members} onChange={e => setEditPlan({ ...editPlan, max_team_members: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Storage (GB)</Label>
                    <Input type="number" value={Math.round(editPlan.storage_limit_bytes / 1073741824)} onChange={e => setEditPlan({ ...editPlan, storage_limit_bytes: Number(e.target.value) * 1073741824 })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Máx. conversas</Label>
                    <Input type="number" value={editPlan.max_conversations ?? ''} placeholder="∞" onChange={e => setEditPlan({ ...editPlan, max_conversations: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                  <div>
                    <Label>Req. IA/mês</Label>
                    <Input type="number" value={editPlan.max_ai_requests_month ?? ''} placeholder="∞" onChange={e => setEditPlan({ ...editPlan, max_ai_requests_month: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                </div>

                <Separator />

                {/* Modules */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Módulos incluídos</Label>
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={selectAllModules}>
                        Selecionar todos
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={deselectAllModules}>
                        Limpar
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_MODULES.map(mod => (
                      <label
                        key={mod.value}
                        className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-accent/50 cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={(editPlan.allowed_modules || []).includes(mod.value)}
                          onCheckedChange={() => toggleModule(mod.value)}
                        />
                        <span className="text-sm">{mod.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="flex items-center gap-2">
                  <Switch checked={editPlan.is_active} onCheckedChange={v => setEditPlan({ ...editPlan, is_active: v })} />
                  <Label>Ativo</Label>
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlan(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (editPlan) {
                  updatePlan.mutate(editPlan);
                  setEditPlan(null);
                }
              }}
              disabled={!editPlan?.name}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
