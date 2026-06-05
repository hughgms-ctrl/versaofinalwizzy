import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Minus, Plus, Trash2, FlaskConical, Route, BarChart3, MousePointerClick, Play, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  EntryFlowExperimentInput,
  EntryFlowType,
  EntryFlowVariantInput,
  useAdminSettings,
  useDeleteEntryFlowExperiment,
  useEntryFlows,
  useSaveEntryFlowExperiment,
  useUpdateTrackingSettings,
  useUpdateEntryFlowSettings,
} from '@/hooks/useAdminDashboard';

type FieldType = 'text' | 'number' | 'switch' | 'textarea';

type FlowField = {
  key: string;
  label: string;
  type: FieldType;
  defaultValue: string | number | boolean;
  helper?: string;
  min?: number;
  max?: number;
};

type FlowOption = {
  value: EntryFlowType;
  label: string;
  description: string;
  whenToUse: string;
  risk: string;
  recommendedMetric: string;
  redirect: string;
  fields: FlowField[];
};

const FLOW_OPTIONS: FlowOption[] = [
  {
    value: 'payment_first',
    label: 'Pagamento primeiro',
    description: 'A pessoa cria conta, entra no app e precisa escolher um plano antes de usar a plataforma.',
    whenToUse: 'Melhor quando a oferta ja esta clara e voce quer levar o usuario direto para assinatura.',
    risk: 'Pode reduzir exploracao inicial se a pessoa ainda precisar sentir valor antes de pagar.',
    recommendedMetric: 'payment_completed',
    redirect: '/auth?intent=plans',
    fields: [
      { key: 'checkout_recovery_enabled', label: 'Recuperacao por e-mail', type: 'switch', defaultValue: true },
      { key: 'checkout_recovery_hours', label: 'Recuperar checkout apos horas', type: 'number', defaultValue: 24, min: 1 },
      { key: 'checkout_recovery_email_subject', label: 'Assunto do e-mail', type: 'text', defaultValue: 'Finalize sua assinatura na Wizzy' },
      {
        key: 'checkout_recovery_email_message',
        label: 'Mensagem do e-mail',
        type: 'textarea',
        defaultValue: 'Voce comecou o checkout do plano {plan_name}, mas ainda nao concluiu a assinatura. Continue de onde parou para liberar o acesso da sua conta.',
      },
    ],
  },
  {
    value: 'trial_auto',
    label: 'Teste gratuito',
    description: 'A pessoa entra no produto com acesso limitado por um periodo de teste.',
    whenToUse: 'Bom para deixar o usuario explorar valor antes de escolher um plano.',
    risk: 'Precisa limitar bem funcionalidades caras ou sensiveis para nao gerar custo sem conversao.',
    recommendedMetric: 'activation_completed',
    redirect: '/auth?intent=trial',
    fields: [
      { key: 'trial_days', label: 'Dias de teste', type: 'number', defaultValue: 7, min: 1, max: 60 },
      { key: 'require_card', label: 'Exigir cartao', type: 'switch', defaultValue: false },
      { key: 'auto_charge_after_trial', label: 'Cobrar automaticamente ao fim', type: 'switch', defaultValue: false },
      { key: 'block_after_trial', label: 'Bloquear apos vencer', type: 'switch', defaultValue: true },
      { key: 'reminder_days_before_end', label: 'Avisar quantos dias antes', type: 'number', defaultValue: 2, min: 0 },
      { key: 'checkout_recovery_enabled', label: 'Recuperacao por e-mail', type: 'switch', defaultValue: true },
      { key: 'checkout_recovery_hours', label: 'Recuperar checkout apos horas', type: 'number', defaultValue: 24, min: 1 },
      { key: 'checkout_recovery_email_subject', label: 'Assunto do e-mail', type: 'text', defaultValue: 'Finalize sua assinatura na Wizzy' },
      {
        key: 'checkout_recovery_email_message',
        label: 'Mensagem do e-mail',
        type: 'textarea',
        defaultValue: 'Voce comecou o checkout do plano {plan_name}, mas ainda nao concluiu a assinatura. Continue de onde parou para liberar o acesso da sua conta.',
      },
      { key: 'allow_create_workspace', label: 'Permitir criar workspace', type: 'switch', defaultValue: false },
      { key: 'max_workspaces', label: 'Workspaces que pode criar', type: 'number', defaultValue: 0, min: 0 },
      { key: 'allow_connect_whatsapp_number', label: 'Permitir conectar numero/WhatsApp', type: 'switch', defaultValue: false },
      { key: 'max_whatsapp_numbers', label: 'Numeros WhatsApp que pode conectar', type: 'number', defaultValue: 0, min: 0 },
      { key: 'allow_connect_ai_api_key', label: 'Permitir conectar token IA', type: 'switch', defaultValue: false },
      { key: 'allow_connect_google_calendar', label: 'Permitir conectar Google Agenda', type: 'switch', defaultValue: false },
      { key: 'max_google_calendars', label: 'Agendas Google que pode conectar', type: 'number', defaultValue: 0, min: 0 },
      { key: 'max_pipelines', label: 'Pipelines que pode criar', type: 'number', defaultValue: 1, min: 0 },
      { key: 'max_flows', label: 'Fluxos que pode criar', type: 'number', defaultValue: 3, min: 0 },
      { key: 'max_campaigns', label: 'Campanhas que pode criar', type: 'number', defaultValue: 1, min: 0 },
      { key: 'max_documents', label: 'Documentos Wizzy Sign', type: 'number', defaultValue: 3, min: 0 },
      { key: 'max_quizzes', label: 'Quizzes que pode criar', type: 'number', defaultValue: 3, min: 0 },
      { key: 'max_forms', label: 'Forms que pode criar', type: 'number', defaultValue: 3, min: 0 },
      { key: 'max_ai_agents', label: 'Agentes IA que pode criar', type: 'number', defaultValue: 1, min: 0 },
    ],
  },
];

const FLOW_ALIASES: Record<string, EntryFlowType> = {
  signup_first_payment_after: 'payment_first',
  signup_onboarding_payment_access: 'payment_first',
  onboarding_before_signup: 'payment_first',
  trial_with_card: 'trial_auto',
  freemium: 'trial_auto',
  access_limited_payment: 'trial_auto',
  manual_approval: 'payment_first',
  demo_first: 'payment_first',
};

const METRIC_OPTIONS = [
  'landing_cta_clicked',
  'signup_completed',
  'onboarding_completed',
  'checkout_started',
  'payment_completed',
  'dashboard_accessed',
  'whatsapp_connected',
  'activation_completed',
  'payment_method_added',
  'upgrade_started',
  'admin_approved',
  'demo_watched',
];

function normalizeFlowType(value: string): EntryFlowType {
  const normalized = FLOW_ALIASES[value] || value;
  return (FLOW_OPTIONS.some((item) => item.value === normalized) ? normalized : 'payment_first') as EntryFlowType;
}

function normalizeFlowConfig(flowType: EntryFlowType, config: Record<string, any> = {}) {
  if (flowType === 'trial_auto') {
    const { plan_slug: _legacyPlanSlug, ...trialConfig } = config;
    return {
      ...trialConfig,
      require_card: config.require_card ?? config.auto_charge_after_trial ?? false,
      auto_charge_after_trial: config.auto_charge_after_trial ?? false,
    };
  }
  if (flowType === 'payment_first') {
    const { plan_slug: _legacyPlanSlug, ...paymentConfig } = config;
    return paymentConfig;
  }
  return config;
}

function getStoredFlowConfig(flowConfigs: Record<string, any> = {}, flowType: EntryFlowType) {
  const legacyConfig = Object.entries(FLOW_ALIASES)
    .filter(([, normalized]) => normalized === flowType)
    .map(([legacyType]) => flowConfigs[legacyType])
    .find(Boolean) || {};

  return normalizeFlowConfig(flowType, {
    ...legacyConfig,
    ...(flowConfigs[flowType] || {}),
  });
}

function getFlow(value: string) {
  const normalized = normalizeFlowType(value);
  return FLOW_OPTIONS.find((item) => item.value === normalized) || FLOW_OPTIONS[0];
}

function getFlowLabel(value: string) {
  return getFlow(value).label;
}

function defaultFlowConfig(flowType: EntryFlowType) {
  const normalizedFlowType = normalizeFlowType(flowType);
  const flow = getFlow(normalizedFlowType);
  return flow.fields.reduce<Record<string, any>>((config, field) => {
    config[field.key] = field.defaultValue;
    return config;
  }, { redirect_path: flow.redirect, primary_metric: flow.recommendedMetric });
}

function defaultVariant(name: string, flowType: EntryFlowType, traffic = 50): EntryFlowVariantInput {
  return {
    name,
    flow_type: flowType,
    traffic_percent: traffic,
    config: defaultFlowConfig(flowType),
  };
}

function suggestedExperiment(status: 'draft' | 'active' = 'draft'): EntryFlowExperimentInput {
  return {
    name: `Teste A/B ${new Date().toLocaleDateString('pt-BR')}`,
    description: 'Comparar cadastro direto contra teste gratuito para descobrir qual formato gera mais ativacao e pagamento.',
    status,
    primary_metric: 'payment_completed',
    variants: [
      defaultVariant('A - Pagamento primeiro', 'payment_first', 50),
      defaultVariant('B - Teste gratuito', 'trial_auto', 50),
    ],
  };
}

export default function AdminGrowthPage() {
  const { data, isLoading, refetch } = useEntryFlows();
  const updateSettings = useUpdateEntryFlowSettings();
  const { data: adminSettings, isLoading: adminSettingsLoading } = useAdminSettings();
  const updateTrackingSettings = useUpdateTrackingSettings();
  const saveExperiment = useSaveEntryFlowExperiment();
  const deleteExperiment = useDeleteEntryFlowExperiment();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<EntryFlowExperimentInput>(suggestedExperiment());

  const settings = data?.settings || {};
  const experiments = data?.experiments || [];
  const activeExperiment = experiments.find((experiment: any) => experiment.status === 'active');
  const totalAssigned = activeExperiment?.metrics?.variant_assigned || 0;

  const settingsDraft = useMemo(() => {
    const defaultFlowType = normalizeFlowType(settings.default_flow_type || 'payment_first');
    return {
      ab_testing_enabled: settings.ab_testing_enabled === true,
      default_flow_type: defaultFlowType,
      default_redirect: settings.default_redirect || getFlow(defaultFlowType).redirect,
      persist_assignment_days: Number(settings.persist_assignment_days || 30),
      flow_configs: settings.flow_configs || {},
    };
  }, [settings]);

  const openNew = (status: 'draft' | 'active' = 'draft') => {
    setDraft(suggestedExperiment(status));
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
      variants: (experiment.variants || []).map((variant: any) => {
        const flowType = normalizeFlowType(variant.flow_type);
        return {
          id: variant.id,
          name: variant.name,
          flow_type: flowType,
          traffic_percent: variant.traffic_percent,
          is_control: variant.is_control,
          config: normalizeFlowConfig(flowType, { ...defaultFlowConfig(flowType), ...(variant.config || {}) }),
        };
      }),
    });
    setDialogOpen(true);
  };

  const updateVariant = (index: number, patch: Partial<EntryFlowVariantInput>) => {
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((variant, itemIndex) => {
        if (itemIndex !== index) return variant;
        const next = { ...variant, ...patch };
        if (patch.flow_type) next.config = defaultFlowConfig(patch.flow_type);
        return next;
      }),
    }));
  };

  const updateVariantConfig = (index: number, key: string, value: any) => {
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((variant, itemIndex) => itemIndex === index
        ? { ...variant, config: { ...(variant.config || {}), [key]: value } }
        : variant),
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
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard icon={<Route className="h-4 w-4" />} title="Fluxo padrao" loading={isLoading} value={getFlowLabel(settingsDraft.default_flow_type)} hint="Usado quando nao ha experimento ativo." />
          <SummaryCard icon={<FlaskConical className="h-4 w-4" />} title="Experimento ativo" loading={isLoading} value={activeExperiment?.name || 'Nenhum'} hint={`A/B testing ${settingsDraft.ab_testing_enabled ? 'ligado' : 'desligado'}.`} />
          <SummaryCard icon={<MousePointerClick className="h-4 w-4" />} title="Visitantes sorteados" loading={isLoading} value={String(totalAssigned)} hint="Evento variant_assigned no experimento ativo." />
        </div>

        <TrackingSettingsCard
          initial={adminSettings?.settings?.tracking_settings?.meta_pixel || {}}
          isLoading={adminSettingsLoading}
          isSaving={updateTrackingSettings.isPending}
          onSave={(metaPixel) => updateTrackingSettings.mutate({ meta_pixel: metaPixel })}
        />

        <Card>
          <CardHeader>
            <CardTitle>Fluxo padrao</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <Skeleton className="h-36 w-full" />
            ) : (
              <>
                <GlobalSettingsForm
                  initial={settingsDraft}
                  hasActiveExperiment={Boolean(activeExperiment)}
                  onNeedsExperiment={() => openNew('active')}
                  onSave={(next) => updateSettings.mutate(next)}
                  isSaving={updateSettings.isPending}
                />

                <Tabs defaultValue="experiments" className="space-y-4">
                  <TabsList className="h-auto flex-wrap justify-start">
                    <TabsTrigger value="experiments" className="gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Experimentos
                    </TabsTrigger>
                    <TabsTrigger value="tests" className="gap-2">
                      <Play className="h-4 w-4" />
                      Painel de testes
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="experiments" className="mt-0">
                    <div className="mb-3 flex justify-end">
                      <Button onClick={() => openNew()} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Novo experimento
                      </Button>
                    </div>
                    <div className="overflow-hidden rounded-lg border">
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
                                  <MetricLine label="Dashboard" value={experiment.metrics?.dashboard_accessed || 0} />
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
                    </div>
                  </TabsContent>

                  <TabsContent value="tests" className="mt-0">
                    <EntryFlowTestPanel
                      settings={settingsDraft}
                      activeExperiment={activeExperiment}
                      onAfterTest={() => refetch()}
                    />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
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
                    variants: [...current.variants, defaultVariant(`Variacao ${current.variants.length + 1}`, 'payment_first', 0)],
                  }))}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar
                </Button>
              </div>

              {draft.variants.map((variant, index) => {
                const flow = getFlow(variant.flow_type);
                return (
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
                            {FLOW_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
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
                    <FlowExplanation flow={flow} />
                    <FlowConfigFields flow={flow} config={variant.config || {}} onChange={(key, value) => updateVariantConfig(index, key, value)} />
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={!draft.name || draft.variants.length === 0 || saveExperiment.isPending}
              onClick={() => saveExperiment.mutate(draft, { onSuccess: () => setDialogOpen(false) })}
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
  hasActiveExperiment,
  isSaving,
  onNeedsExperiment,
  onSave,
}: {
  initial: {
    ab_testing_enabled: boolean;
    default_flow_type: EntryFlowType;
    default_redirect: string;
    persist_assignment_days: number;
    flow_configs: Record<string, any>;
  };
  hasActiveExperiment: boolean;
  isSaving: boolean;
  onNeedsExperiment: () => void;
  onSave: (settings: {
    ab_testing_enabled: boolean;
    default_flow_type: EntryFlowType;
    default_redirect: string;
    persist_assignment_days: number;
    flow_configs: Record<string, any>;
  }) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const selectedFlow = getFlow(draft.default_flow_type);
  const selectedConfig = {
    ...defaultFlowConfig(draft.default_flow_type),
    ...getStoredFlowConfig(draft.flow_configs, draft.default_flow_type),
    redirect_path: draft.default_redirect,
  };

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const updateSelectedConfig = (key: string, value: any) => {
    setDraft((current) => {
      const nextConfig = {
        ...defaultFlowConfig(current.default_flow_type),
        ...getStoredFlowConfig(current.flow_configs, current.default_flow_type),
        [key]: value,
      };
      return {
        ...current,
        default_redirect: key === 'redirect_path' ? String(value) : current.default_redirect,
        flow_configs: {
          ...(current.flow_configs || {}),
          [current.default_flow_type]: nextConfig,
        },
      };
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-2">
          <Label>Fluxo padrao</Label>
          <Select value={draft.default_flow_type} onValueChange={(value) => {
            const flowType = value as EntryFlowType;
            const flow = getFlow(flowType);
            setDraft((current) => ({
              ...current,
              default_flow_type: flowType,
              default_redirect: getStoredFlowConfig(current.flow_configs, flowType).redirect_path || flow.redirect,
              flow_configs: {
                ...(current.flow_configs || {}),
                [flowType]: {
                  ...defaultFlowConfig(flowType),
                  ...getStoredFlowConfig(current.flow_configs, flowType),
                  redirect_path: getStoredFlowConfig(current.flow_configs, flowType).redirect_path || flow.redirect,
                },
              },
            }));
          }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FLOW_OPTIONS.map((flow) => <SelectItem key={flow.value} value={flow.value}>{flow.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Redirecionamento padrao</Label>
          <Input value={draft.default_redirect} onChange={(event) => updateSelectedConfig('redirect_path', event.target.value)} />
        </div>
        <div className="flex items-end gap-4">
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5">
            <Switch
              checked={draft.ab_testing_enabled}
              onCheckedChange={(checked) => {
                setDraft((current) => ({ ...current, ab_testing_enabled: checked }));
                if (checked && !hasActiveExperiment) onNeedsExperiment();
              }}
            />
            <span className="text-sm">A/B ativo</span>
          </div>
          <Button onClick={() => onSave(draft)} disabled={isSaving}>Salvar</Button>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Fluxo padrao</Badge>
          <p className="text-sm font-medium">{selectedFlow.label}</p>
        </div>
        <FlowExplanation flow={selectedFlow} />
        <FlowConfigFields flow={selectedFlow} config={selectedConfig} onChange={updateSelectedConfig} />
      </div>
    </div>
  );
}

function FlowExplanation({ flow }: { flow: FlowOption }) {
  return (
    <div className="mt-3 grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
      <div>
        <p className="font-medium text-foreground">Como funciona</p>
        <p className="mt-1">{flow.description}</p>
      </div>
      <div>
        <p className="font-medium text-foreground">Quando usar</p>
        <p className="mt-1">{flow.whenToUse}</p>
      </div>
      <div>
        <p className="font-medium text-foreground">Ponto de atencao</p>
        <p className="mt-1">{flow.risk}</p>
      </div>
    </div>
  );
}

function FlowConfigFields({ flow, config, onChange }: { flow: FlowOption; config: Record<string, any>; onChange: (key: string, value: any) => void }) {
  if (flow.value === 'trial_auto') {
    return <TrialConfigFields flow={flow} config={config} onChange={onChange} />;
  }

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div className="space-y-2">
        <Label>Redirecionamento</Label>
        <Input value={config.redirect_path || flow.redirect} onChange={(event) => onChange('redirect_path', event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Metrica recomendada</Label>
        <Input value={config.primary_metric || flow.recommendedMetric} onChange={(event) => onChange('primary_metric', event.target.value)} />
      </div>
      {flow.fields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label>{field.label}</Label>
          {field.type === 'switch' ? (
            <div className="flex h-10 items-center gap-3 rounded-md border px-3">
              <Switch checked={config[field.key] ?? field.defaultValue} onCheckedChange={(checked) => onChange(field.key, checked)} />
              <span className="text-sm text-muted-foreground">{config[field.key] ?? field.defaultValue ? 'Ativo' : 'Inativo'}</span>
            </div>
          ) : field.type === 'textarea' ? (
            <Textarea
              rows={4}
              value={config[field.key] ?? field.defaultValue}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          ) : (
            <Input
              type={field.type}
              min={field.min}
              max={field.max}
              value={config[field.key] ?? field.defaultValue}
              onChange={(event) => onChange(field.key, field.type === 'number' ? Number(event.target.value) : event.target.value)}
            />
          )}
          {field.helper && <p className="text-xs text-muted-foreground">{field.helper}</p>}
        </div>
      ))}
    </div>
  );
}

const TRIAL_CONNECTION_RULES = [
  {
    enabledKey: 'allow_create_workspace',
    limitKey: 'max_workspaces',
    title: 'Criar workspace',
    description: 'Permite criar novas areas de trabalho alem da inicial.',
    unit: 'workspaces',
  },
  {
    enabledKey: 'allow_connect_whatsapp_number',
    limitKey: 'max_whatsapp_numbers',
    title: 'Conectar numero WhatsApp',
    description: 'Libera conexao de numeros para atendimento e automacoes.',
    unit: 'numeros',
  },
  {
    enabledKey: 'allow_connect_ai_api_key',
    title: 'Conectar token IA',
    description: 'Libera uso de chave propria para agentes e recursos de IA.',
  },
  {
    enabledKey: 'allow_connect_google_calendar',
    limitKey: 'max_google_calendars',
    title: 'Conectar Google Agenda',
    description: 'Permite integrar agendas externas ao calendario.',
    unit: 'agendas',
  },
];

const TRIAL_CREATION_LIMITS = [
  { key: 'max_pipelines', title: 'Pipelines', description: 'Funis que podem ser criados.' },
  { key: 'max_flows', title: 'Fluxos', description: 'Automacoes que podem ser criadas.' },
  { key: 'max_campaigns', title: 'Campanhas', description: 'Campanhas e gatilhos disparaveis.' },
  { key: 'max_documents', title: 'Wizzy Sign', description: 'Documentos de assinatura criados.' },
  { key: 'max_quizzes', title: 'Quizzes', description: 'Quizzes ativos ou criados.' },
  { key: 'max_forms', title: 'Forms', description: 'Formularios e capturas criadas.' },
  { key: 'max_ai_agents', title: 'Agentes IA', description: 'Agentes criados quando IA estiver liberada.' },
];

function TrialConfigFields({ flow, config, onChange }: { flow: FlowOption; config: Record<string, any>; onChange: (key: string, value: any) => void }) {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const requireCard = config.require_card === true;
  const trialDays = Number(config.trial_days ?? 7);
  const setRequireCard = (checked: boolean) => {
    onChange('require_card', checked);
    onChange('auto_charge_after_trial', checked);
    onChange('redirect_path', checked ? '/auth?intent=plans' : flow.redirect);
  };

  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Redirecionamento</Label>
          <Input value={config.redirect_path || flow.redirect} onChange={(event) => onChange('redirect_path', event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Metrica recomendada</Label>
          <Input value={config.primary_metric || flow.recommendedMetric} onChange={(event) => onChange('primary_metric', event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Dias de teste</Label>
          <QuantityStepper value={Number(config.trial_days ?? 7)} min={1} onChange={(value) => onChange('trial_days', value)} />
        </div>
        <ToggleRow
          title="Exigir cartao no teste"
          description="Quando ativo, o plano escolhido pelo cliente antes do cadastro abre checkout logo apos criar a conta."
          checked={requireCard}
          onChange={setRequireCard}
        />
        <ToggleRow
          title="Cobrar automaticamente ao fim"
          description="Com cartao exigido, a assinatura fica pronta para cobrar quando o teste terminar. O cliente pode cancelar antes."
          checked={config.auto_charge_after_trial ?? requireCard}
          onChange={(checked) => onChange('auto_charge_after_trial', checked)}
        />
        <ToggleRow
          title="Bloquear apos vencer"
          description="Ao terminar o teste, envia para planos antes de continuar."
          checked={config.block_after_trial ?? true}
          onChange={(checked) => onChange('block_after_trial', checked)}
        />
        <div className="space-y-2">
          <Label>Avisar quantos dias antes</Label>
          <QuantityStepper value={Number(config.reminder_days_before_end ?? 2)} min={0} onChange={(value) => onChange('reminder_days_before_end', value)} />
        </div>
      </div>

      <section className="rounded-md border p-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Recuperacao de checkout por e-mail</p>
            <p className="text-xs text-muted-foreground">Envia um lembrete para quem abriu o checkout e nao concluiu o pagamento.</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={config.checkout_recovery_enabled ?? true}
              onCheckedChange={(checked) => onChange('checkout_recovery_enabled', checked)}
            />
            <span className="w-14 text-xs text-muted-foreground">{config.checkout_recovery_enabled ?? true ? 'Ativo' : 'Inativo'}</span>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Recuperar checkout apos horas</Label>
            <QuantityStepper
              value={Number(config.checkout_recovery_hours ?? 24)}
              min={1}
              onChange={(value) => onChange('checkout_recovery_hours', value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Assunto do e-mail</Label>
            <Input
              value={config.checkout_recovery_email_subject ?? 'Finalize sua assinatura na Wizzy'}
              onChange={(event) => onChange('checkout_recovery_email_subject', event.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Mensagem do e-mail</Label>
            <Textarea
              rows={4}
              value={
                config.checkout_recovery_email_message ??
                'Voce comecou o checkout do plano {plan_name}, mas ainda nao concluiu a assinatura. Continue de onde parou para liberar o acesso da sua conta.'
              }
              onChange={(event) => onChange('checkout_recovery_email_message', event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Variaveis disponiveis: {'{plan_name}'}, {'{plan_price}'} e {'{checkout_link}'}.</p>
          </div>
        </div>
      </section>

      {requireCard && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Checkout com teste no cartao</p>
          <p className="mt-1">
            O checkout usa o plano que o cliente clicou. No Asaas, ele deve exibir cobranca de R$ 0 hoje e primeira cobranca em {trialDays} dia{trialDays === 1 ? '' : 's'} no valor desse plano.
            O cliente precisa conseguir cancelar a assinatura antes da primeira cobranca.
          </p>
        </div>
      )}

      <section className="border-t pt-4">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 text-left"
          onClick={() => setDetailsOpen((open) => !open)}
        >
          <div>
            <p className="text-sm font-semibold">Acoes sensiveis</p>
            <p className="text-xs text-muted-foreground">Conexoes, estruturas e limites que controlam o que pode ser criado no teste.</p>
          </div>
          <span className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background">
            {detailsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </button>

        {detailsOpen && (
          <div className="mt-4 space-y-5">
            <div className="divide-y rounded-md border">
              {TRIAL_CONNECTION_RULES.map((rule) => (
                <PermissionLimitRow
                  key={rule.enabledKey}
                  title={rule.title}
                  description={rule.description}
                  unit={rule.unit}
                  enabled={config[rule.enabledKey] === true}
                  limit={rule.limitKey ? Number(config[rule.limitKey] ?? 0) : undefined}
                  onEnabledChange={(checked) => {
                    onChange(rule.enabledKey, checked);
                    if (rule.limitKey && checked && Number(config[rule.limitKey] ?? 0) === 0) onChange(rule.limitKey, 1);
                  }}
                  onLimitChange={rule.limitKey ? (value) => onChange(rule.limitKey!, value) : undefined}
                />
              ))}
            </div>

            <div>
              <div className="mb-3">
                <p className="text-sm font-semibold">Limites de criacao</p>
                <p className="text-xs text-muted-foreground">As telas ficam visiveis; estes limites controlam quantos itens o usuario pode criar no teste.</p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {TRIAL_CREATION_LIMITS.map((limit) => (
                  <CreationLimitRow
                    key={limit.key}
                    title={limit.title}
                    description={limit.description}
                    value={Number(config[limit.key] ?? 0)}
                    onChange={(value) => onChange(limit.key, value)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ToggleRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 rounded-md border px-3 py-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function PermissionLimitRow({
  title,
  description,
  unit,
  enabled,
  limit,
  onEnabledChange,
  onLimitChange,
}: {
  title: string;
  description: string;
  unit?: string;
  enabled: boolean;
  limit?: number;
  onEnabledChange: (checked: boolean) => void;
  onLimitChange?: (value: number) => void;
}) {
  return (
    <div className="grid gap-3 py-3 md:grid-cols-[1fr_auto_auto] md:items-center">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {onLimitChange && (
        <div className="flex items-center gap-2">
          <QuantityStepper value={limit ?? 0} min={0} disabled={!enabled} onChange={onLimitChange} />
          <span className="w-20 text-xs text-muted-foreground">{unit}</span>
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
        <span className="w-14 text-xs text-muted-foreground">{enabled ? 'Ativo' : 'Inativo'}</span>
      </div>
    </div>
  );
}

function CreationLimitRow({ title, description, value, onChange }: { title: string; description: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <QuantityStepper value={value} min={0} onChange={onChange} />
    </div>
  );
}

function QuantityStepper({ value, min = 0, max, disabled, onChange }: { value: number; min?: number; max?: number; disabled?: boolean; onChange: (value: number) => void }) {
  const commit = (next: number) => {
    const safeMax = typeof max === 'number' ? max : Number.MAX_SAFE_INTEGER;
    onChange(Math.min(safeMax, Math.max(min, Number.isFinite(next) ? next : min)));
  };

  return (
    <div className="flex h-9 items-center overflow-hidden rounded-md border bg-background">
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-none" disabled={disabled || value <= min} onClick={() => commit(value - 1)}>
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <Input
        type="number"
        min={min}
        max={max}
        disabled={disabled}
        value={value}
        onChange={(event) => commit(Number(event.target.value))}
        className="h-9 w-16 rounded-none border-0 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-none" disabled={disabled || (typeof max === 'number' && value >= max)} onClick={() => commit(value + 1)}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function newTestVisitorId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `test-${crypto.randomUUID()}`;
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function EntryFlowTestPanel({
  settings,
  activeExperiment,
  onAfterTest,
}: {
  settings: {
    ab_testing_enabled: boolean;
    default_flow_type: EntryFlowType;
    default_redirect: string;
    persist_assignment_days: number;
    flow_configs: Record<string, any>;
  };
  activeExperiment: any;
  onAfterTest: () => void;
}) {
  const [visitorId, setVisitorId] = useState(newTestVisitorId());
  const [path, setPath] = useState('/landing?test=admin');
  const [eventName, setEventName] = useState('landing_cta_clicked');
  const [assignment, setAssignment] = useState<any>(null);
  const [previousVariantId, setPreviousVariantId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [log, setLog] = useState<Array<{ time: string; label: string; detail: string }>>([]);

  const appendLog = (label: string, detail: string) => {
    setLog((current) => [
      { time: new Date().toLocaleTimeString('pt-BR'), label, detail },
      ...current,
    ].slice(0, 8));
  };

  const runAssignment = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('entry-flow', {
        body: {
          action: 'assign',
          visitor_id: visitorId,
          path,
        },
      });
      if (error) throw error;

      const variant = data?.variant || {};
      setAssignment(data);
      const sameVariant = previousVariantId && variant.id && previousVariantId === variant.id;
      setPreviousVariantId(variant.id || null);
      appendLog(
        'Sorteio executado',
        `${variant.name || 'Padrao'} -> ${getFlowLabel(variant.flow_type || settings.default_flow_type)}${sameVariant ? ' (persistiu para o mesmo visitante)' : ''}`,
      );
      toast.success('Fluxo sorteado');
      onAfterTest();
    } catch (err: any) {
      appendLog('Erro no sorteio', err?.message || 'Falha desconhecida');
      toast.error(err?.message || 'Falha ao sortear fluxo');
    } finally {
      setIsRunning(false);
    }
  };

  const sendEvent = async (name = eventName) => {
    setIsRunning(true);
    try {
      const variant = assignment?.variant || {};
      const { error } = await supabase.functions.invoke('entry-flow', {
        body: {
          action: 'event',
          visitor_id: visitorId,
          experiment_id: assignment?.experiment?.id || assignment?.assignment?.experiment_id || null,
          variant_id: variant.id || assignment?.assignment?.variant_id || null,
          event_name: name,
          metadata: {
            source: 'admin_test_panel',
            path,
            flow_type: variant.flow_type || settings.default_flow_type,
            variant_name: variant.name || 'Padrao',
          },
        },
      });
      if (error) throw error;
      appendLog('Evento registrado', name);
      toast.success(`Evento ${name} registrado`);
      onAfterTest();
    } catch (err: any) {
      appendLog('Erro no evento', err?.message || 'Falha desconhecida');
      toast.error(err?.message || 'Falha ao registrar evento');
    } finally {
      setIsRunning(false);
    }
  };

  const sendFunnel = async () => {
    const events = ['landing_cta_clicked', 'signup_completed', 'dashboard_accessed', 'checkout_started', 'payment_completed'];
    for (const event of events) {
      await sendEvent(event);
    }
  };

  const variant = assignment?.variant || null;
  const experiment = assignment?.experiment || null;
  const isFallback = !experiment;

  return (
    <div className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-2">
            <Label>Visitante de teste</Label>
            <Input value={visitorId} onChange={(event) => setVisitorId(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Caminho simulado</Label>
            <Input value={path} onChange={(event) => setPath(event.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const next = newTestVisitorId();
                setVisitorId(next);
                setAssignment(null);
                setPreviousVariantId(null);
                appendLog('Novo visitante', next);
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Novo
            </Button>
            <Button onClick={runAssignment} disabled={isRunning || !visitorId}>
              Sortear fluxo
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Motor atual</p>
            <p className="mt-2 text-sm font-semibold">{settings.ab_testing_enabled ? 'A/B ligado' : 'Fluxo padrao'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeExperiment ? activeExperiment.name : 'Sem experimento ativo'}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Resultado</p>
            <p className="mt-2 text-sm font-semibold">{variant ? getFlowLabel(variant.flow_type) : 'Ainda nao testado'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{variant?.name || (isFallback ? 'Usara o fluxo padrao' : 'Aguardando sorteio')}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Redirecionamento</p>
            <p className="mt-2 break-all text-sm font-semibold">{variant?.redirect_path || settings.default_redirect}</p>
            <p className="mt-1 text-xs text-muted-foreground">{experiment ? 'Vindo da variante sorteada' : 'Fallback/padrao'}</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1 space-y-2">
                <Label>Evento para registrar</Label>
                <Select value={eventName} onValueChange={setEventName}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METRIC_OPTIONS.map((metric) => <SelectItem key={metric} value={metric}>{metric}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => sendEvent()} disabled={isRunning || !visitorId}>
                Registrar evento
              </Button>
              <Button variant="outline" onClick={sendFunnel} disabled={isRunning || !visitorId}>
                Simular funil completo
              </Button>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">Configuracao recebida</p>
              <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(variant?.config || settings.flow_configs?.[settings.default_flow_type] || {}, null, 2)}
              </pre>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">Historico do teste</p>
            <div className="mt-3 space-y-2">
              {log.map((item, index) => (
                <div key={`${item.time}-${index}`} className="rounded-md bg-muted/40 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-muted-foreground">{item.time}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{item.detail}</p>
                </div>
              ))}
              {log.length === 0 && (
                <p className="rounded-md bg-muted/40 px-3 py-6 text-center text-xs text-muted-foreground">
                  Execute um sorteio para ver o diagnostico.
                </p>
              )}
            </div>
          </div>
        </div>
    </div>
  );
}

function TrackingSettingsCard({
  initial,
  isLoading,
  isSaving,
  onSave,
}: {
  initial: Record<string, any>;
  isLoading: boolean;
  isSaving: boolean;
  onSave: (metaPixel: {
    enabled: boolean;
    pixel_id: string;
    advanced_matching_enabled: boolean;
    test_event_code: string;
  }) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [pixelId, setPixelId] = useState('');
  const [advancedMatchingEnabled, setAdvancedMatchingEnabled] = useState(false);
  const [testEventCode, setTestEventCode] = useState('');

  useEffect(() => {
    setEnabled(initial?.enabled === true);
    setPixelId(String(initial?.pixel_id || ''));
    setAdvancedMatchingEnabled(initial?.advanced_matching_enabled === true);
    setTestEventCode(String(initial?.test_event_code || ''));
  }, [initial?.enabled, initial?.pixel_id, initial?.advanced_matching_enabled, initial?.test_event_code]);

  const cleanPixelId = pixelId.replace(/\D/g, '');
  const canSave = !enabled || cleanPixelId.length >= 8;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          Pixel da Meta
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium text-foreground">Ativar Meta Pixel no site inteiro</p>
                <p className="text-sm text-muted-foreground">
                  Dispara PageView em todas as paginas, Lead nos CTAs, InitiateCheckout ao abrir checkout e Purchase no retorno de compra.
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>ID do Pixel</Label>
                <Input
                  value={pixelId}
                  inputMode="numeric"
                  placeholder="Ex: 123456789012345"
                  onChange={(event) => setPixelId(event.target.value.replace(/\D/g, ''))}
                />
                <p className="text-xs text-muted-foreground">
                  Copie o ID numerico do Pixel no Gerenciador de Eventos da Meta.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Codigo de evento de teste</Label>
                <Input
                  value={testEventCode}
                  placeholder="Opcional"
                  onChange={(event) => setTestEventCode(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use durante testes no Events Manager. Pode ficar vazio em producao.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium text-foreground">Advanced Matching</p>
                <p className="text-sm text-muted-foreground">
                  Deixe preparado para enviar dados anonimizados quando implementarmos captura segura de e-mail/telefone.
                </p>
              </div>
              <Switch checked={advancedMatchingEnabled} onCheckedChange={setAdvancedMatchingEnabled} />
            </div>

            {!canSave && (
              <p className="text-sm text-destructive">Informe um ID de Pixel valido ou desative o Pixel.</p>
            )}

            <div className="flex justify-end">
              <Button
                onClick={() => onSave({
                  enabled,
                  pixel_id: cleanPixelId,
                  advanced_matching_enabled: advancedMatchingEnabled,
                  test_event_code: testEventCode.trim(),
                })}
                disabled={isSaving || !canSave}
              >
                {isSaving ? 'Salvando...' : 'Salvar Pixel'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ icon, title, loading, value, hint }: { icon: ReactNode; title: string; loading: boolean; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-36" /> : <p className="text-2xl font-bold">{value}</p>}
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
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
