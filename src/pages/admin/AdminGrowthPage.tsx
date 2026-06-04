import { useMemo, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2, FlaskConical, Route, BarChart3, MousePointerClick } from 'lucide-react';
import {
  EntryFlowExperimentInput,
  EntryFlowType,
  EntryFlowVariantInput,
  useDeleteEntryFlowExperiment,
  useEntryFlows,
  useSaveEntryFlowExperiment,
  useUpdateEntryFlowSettings,
} from '@/hooks/useAdminDashboard';

const FLOW_OPTIONS: Array<{ value: EntryFlowType; label: string; description: string; redirect: string }> = [
  { value: 'payment_first', label: 'Pagamento primeiro', description: 'CTA leva para cadastro com intencao de plano e depois checkout.', redirect: '/auth?intent=plans' },
  { value: 'signup_first_payment_after', label: 'Cadastro primeiro', description: 'Cadastro, tela de assinatura e pagamento depois.', redirect: '/auth' },
  { value: 'signup_onboarding_payment_access', label: 'Cadastro + onboarding + pagamento', description: 'Cadastro com intencao de onboarding antes de pagar.', redirect: '/auth?intent=onboarding' },
  { value: 'trial_auto', label: 'Trial automatico', description: 'Cadastro marcado como teste automatico.', redirect: '/auth?intent=trial' },
  { value: 'trial_with_card', label: 'Trial com cartao', description: 'Cadastro com checkout antes do acesso amplo.', redirect: '/auth?intent=plans' },
  { value: 'manual_approval', label: 'Aprovacao manual', description: 'Cadastro para avaliacao do admin.', redirect: '/auth?intent=approval' },
  { value: 'freemium', label: 'Freemium', description: 'Cadastro para acesso gratuito/limitado.', redirect: '/auth?intent=freemium' },
  { value: 'demo_first', label: 'Demo primeiro', description: 'CTA envia para secao ou pagina de demonstracao.', redirect: '/landing#video' },
  { value: 'onboarding_before_signup', label: 'Onboarding antes do cadastro', description: 'Coleta intenção antes de entrar no produto.', redirect: '/auth?intent=onboarding' },
  { value: 'access_limited_payment', label: 'Acesso limitado + pagamento', description: 'Cadastro com acesso limitado e upgrade dentro do app.', redirect: '/auth?intent=limited' },
];

const METRIC_OPTIONS = [
  'landing_cta_clicked',
  'signup_completed',
  'onboarding_completed',
  'checkout_started',
  'payment_completed',
  'dashboard_accessed',
  'whatsapp_connected',
  'activation_completed',
];

function getFlowLabel(value: string) {
  return FLOW_OPTIONS.find((item) => item.value === value)?.label || value;
}

function defaultVariant(name: string, flowType: EntryFlowType, traffic = 50): EntryFlowVariantInput {
  const flow = FLOW_OPTIONS.find((item) => item.value === flowType);
  return {
    name,
    flow_type: flowType,
    traffic_percent: traffic,
    config: { redirect_path: flow?.redirect || '/auth' },
  };
}

const emptyExperiment: EntryFlowExperimentInput = {
  name: '',
  description: '',
  status: 'draft',
  primary_metric: 'payment_completed',
  variants: [
    defaultVariant('A - Cadastro primeiro', 'signup_first_payment_after', 50),
    defaultVariant('B - Trial automatico', 'trial_auto', 50),
  ],
};

export default function AdminGrowthPage() {
  const { data, isLoading } = useEntryFlows();
  const updateSettings = useUpdateEntryFlowSettings();
  const saveExperiment = useSaveEntryFlowExperiment();
  const deleteExperiment = useDeleteEntryFlowExperiment();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<EntryFlowExperimentInput>(emptyExperiment);

  const settings = data?.settings || {};
  const experiments = data?.experiments || [];
  const activeExperiment = experiments.find((experiment: any) => experiment.status === 'active');
  const totalAssigned = activeExperiment?.metrics?.variant_assigned || 0;

  const settingsDraft = useMemo(() => ({
    ab_testing_enabled: settings.ab_testing_enabled === true,
    default_flow_type: (settings.default_flow_type || 'signup_first_payment_after') as EntryFlowType,
    default_redirect: settings.default_redirect || '/auth',
    persist_assignment_days: Number(settings.persist_assignment_days || 30),
  }), [settings]);

  const openNew = () => {
    setDraft({
      ...emptyExperiment,
      name: `Experimento ${new Date().toLocaleDateString('pt-BR')}`,
      variants: emptyExperiment.variants.map((variant) => ({ ...variant, config: { ...(variant.config || {}) } })),
    });
    setDialogOpen(true);
  };

  const openEdit = (experiment: any) => {
    setDraft({
      id: experiment.id,
      name: experiment.name,
      description: experiment.description || '',
      status: experiment.status,
      primary_metric: experiment.primary_metric || 'payment_completed',
      starts_at: experiment.starts_at ? experiment.starts_at.slice(0, 16) : '',
      ends_at: experiment.ends_at ? experiment.ends_at.slice(0, 16) : '',
      audience: experiment.audience || {},
      variants: (experiment.variants || []).map((variant: any) => ({
        id: variant.id,
        name: variant.name,
        flow_type: variant.flow_type,
        traffic_percent: variant.traffic_percent,
        is_control: variant.is_control,
        config: variant.config || {},
      })),
    });
    setDialogOpen(true);
  };

  const updateVariant = (index: number, patch: Partial<EntryFlowVariantInput>) => {
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((variant, itemIndex) => {
        if (itemIndex !== index) return variant;
        const next = { ...variant, ...patch };
        if (patch.flow_type) {
          const flow = FLOW_OPTIONS.find((item) => item.value === patch.flow_type);
          next.config = { ...(next.config || {}), redirect_path: flow?.redirect || '/auth' };
        }
        return next;
      }),
    }));
  };

  const totalTraffic = draft.variants.reduce((sum, variant) => sum + Number(variant.traffic_percent || 0), 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Crescimento</h1>
            <p className="text-muted-foreground mt-1">Fluxos de entrada, onboarding e testes A/B da landing.</p>
          </div>
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo experimento
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Route className="h-4 w-4" />
                Fluxo padrao
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-36" /> : <p className="text-2xl font-bold">{getFlowLabel(settingsDraft.default_flow_type)}</p>}
              <p className="mt-1 text-xs text-muted-foreground">Usado quando nao ha experimento ativo.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FlaskConical className="h-4 w-4" />
                Experimento ativo
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-36" /> : <p className="text-2xl font-bold">{activeExperiment?.name || 'Nenhum'}</p>}
              <p className="mt-1 text-xs text-muted-foreground">A/B testing {settingsDraft.ab_testing_enabled ? 'ligado' : 'desligado'}.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <MousePointerClick className="h-4 w-4" />
                Visitantes sorteados
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-8 w-20" /> : <p className="text-2xl font-bold">{totalAssigned}</p>}
              <p className="mt-1 text-xs text-muted-foreground">Evento `variant_assigned` no experimento ativo.</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Configuração Global</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <GlobalSettingsForm
                initial={settingsDraft}
                onSave={(next) => updateSettings.mutate(next)}
                isSaving={updateSettings.isPending}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Experimentos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Metrica principal</TableHead>
                    <TableHead>Variacoes</TableHead>
                    <TableHead>Resultados</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {experiments.map((experiment: any) => (
                    <TableRow key={experiment.id}>
                      <TableCell>
                        <p className="font-medium">{experiment.name}</p>
                        <p className="text-xs text-muted-foreground">{experiment.description || 'Sem descricao'}</p>
                      </TableCell>
                      <TableCell><StatusBadge status={experiment.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{experiment.primary_metric}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {(experiment.variants || []).map((variant: any) => (
                            <div key={variant.id} className="text-xs">
                              <span className="font-medium">{variant.name}</span>
                              <span className="text-muted-foreground"> - {variant.traffic_percent}% - {getFlowLabel(variant.flow_type)}</span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-xs">
                          <MetricLine label="CTA" value={experiment.metrics?.landing_cta_clicked || 0} />
                          <MetricLine label="Cadastro" value={experiment.metrics?.signup_completed || 0} />
                          <MetricLine label="Checkout" value={experiment.metrics?.checkout_started || 0} />
                          <MetricLine label="Pago" value={experiment.metrics?.payment_completed || 0} />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(experiment)}>Editar</Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteExperiment.mutate(experiment.id)}
                          disabled={deleteExperiment.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {experiments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Nenhum experimento criado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Editar experimento' : 'Novo experimento'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={draft.status} onValueChange={(value) => setDraft((current) => ({ ...current, status: value as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="paused">Pausado</SelectItem>
                    <SelectItem value="ended">Finalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descricao</Label>
              <Textarea value={draft.description || ''} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Metrica principal</Label>
                <Select value={draft.primary_metric} onValueChange={(value) => setDraft((current) => ({ ...current, primary_metric: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METRIC_OPTIONS.map((metric) => <SelectItem key={metric} value={metric}>{metric}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Inicio</Label>
                <Input type="datetime-local" value={draft.starts_at || ''} onChange={(event) => setDraft((current) => ({ ...current, starts_at: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <Input type="datetime-local" value={draft.ends_at || ''} onChange={(event) => setDraft((current) => ({ ...current, ends_at: event.target.value }))} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Variacoes</Label>
                  <p className={`text-xs ${totalTraffic === 100 ? 'text-muted-foreground' : 'text-destructive'}`}>
                    Soma de trafego: {totalTraffic}% {totalTraffic !== 100 ? '(recomendado: 100%)' : ''}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraft((current) => ({
                    ...current,
                    variants: [...current.variants, defaultVariant(`Variacao ${current.variants.length + 1}`, 'signup_first_payment_after', 0)],
                  }))}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar
                </Button>
              </div>

              {draft.variants.map((variant, index) => (
                <div key={variant.id || index} className="rounded-lg border p-4">
                  <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_120px_44px]">
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input value={variant.name} onChange={(event) => updateVariant(index, { name: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Fluxo</Label>
                      <Select value={variant.flow_type} onValueChange={(value) => updateVariant(index, { flow_type: value as EntryFlowType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FLOW_OPTIONS.map((flow) => <SelectItem key={flow.value} value={flow.value}>{flow.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Trafego %</Label>
                      <Input type="number" min={0} max={100} value={variant.traffic_percent} onChange={(event) => updateVariant(index, { traffic_percent: Number(event.target.value) })} />
                    </div>
                    <div className="flex items-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        disabled={draft.variants.length <= 1}
                        onClick={() => setDraft((current) => ({ ...current, variants: current.variants.filter((_, itemIndex) => itemIndex !== index) }))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{FLOW_OPTIONS.find((flow) => flow.value === variant.flow_type)?.description}</p>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={!draft.name || draft.variants.length === 0 || saveExperiment.isPending}
              onClick={() => {
                saveExperiment.mutate(draft, { onSuccess: () => setDialogOpen(false) });
              }}
            >
              Salvar experimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function GlobalSettingsForm({
  initial,
  isSaving,
  onSave,
}: {
  initial: {
    ab_testing_enabled: boolean;
    default_flow_type: EntryFlowType;
    default_redirect: string;
    persist_assignment_days: number;
  };
  isSaving: boolean;
  onSave: (settings: {
    ab_testing_enabled: boolean;
    default_flow_type: EntryFlowType;
    default_redirect: string;
    persist_assignment_days: number;
  }) => void;
}) {
  const [draft, setDraft] = useState(initial);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
      <div className="space-y-2">
        <Label>Fluxo padrao</Label>
        <Select value={draft.default_flow_type} onValueChange={(value) => {
          const flow = FLOW_OPTIONS.find((item) => item.value === value);
          setDraft((current) => ({ ...current, default_flow_type: value as EntryFlowType, default_redirect: flow?.redirect || '/auth' }));
        }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {FLOW_OPTIONS.map((flow) => <SelectItem key={flow.value} value={flow.value}>{flow.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Redirecionamento padrao</Label>
        <Input value={draft.default_redirect} onChange={(event) => setDraft((current) => ({ ...current, default_redirect: event.target.value }))} />
      </div>
      <div className="flex items-end gap-4">
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5">
          <Switch checked={draft.ab_testing_enabled} onCheckedChange={(checked) => setDraft((current) => ({ ...current, ab_testing_enabled: checked }))} />
          <span className="text-sm">A/B ativo</span>
        </div>
        <Button onClick={() => onSave(draft)} disabled={isSaving}>Salvar</Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'active' ? 'default' : status === 'paused' ? 'secondary' : status === 'ended' ? 'outline' : 'secondary';
  const label: Record<string, string> = { draft: 'Rascunho', active: 'Ativo', paused: 'Pausado', ended: 'Finalizado' };
  return <Badge variant={variant}>{label[status] || status}</Badge>;
}

function MetricLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
