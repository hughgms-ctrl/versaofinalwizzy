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

type FieldType = 'text' | 'number' | 'switch';

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
    description: 'A pessoa cria conta e segue para plano/checkout antes de acessar o produto.',
    whenToUse: 'Melhor para oferta direta, ticket claro e lead com alta intencao.',
    risk: 'Pode reduzir cadastros se o usuario ainda precisar entender valor antes de pagar.',
    recommendedMetric: 'payment_completed',
    redirect: '/auth?intent=plans',
    fields: [
      { key: 'plan_slug', label: 'Plano sugerido', type: 'text', defaultValue: 'pro', helper: 'Slug do plano que deve aparecer como principal.' },
      { key: 'allow_signup_without_payment', label: 'Permitir cadastro sem pagamento', type: 'switch', defaultValue: false },
      { key: 'checkout_recovery_hours', label: 'Recuperar checkout apos horas', type: 'number', defaultValue: 24, min: 1 },
    ],
  },
  {
    value: 'signup_first_payment_after',
    label: 'Cadastro primeiro',
    description: 'A pessoa cria conta primeiro e decide o plano depois.',
    whenToUse: 'Bom para diminuir atrito e medir volume de leads qualificados.',
    risk: 'Pode aumentar cadastros curiosos sem intencao de pagamento.',
    recommendedMetric: 'checkout_started',
    redirect: '/auth',
    fields: [
      { key: 'post_signup_route', label: 'Destino apos cadastro', type: 'text', defaultValue: '/dashboard' },
      { key: 'show_plans_after_signup', label: 'Mostrar planos apos cadastro', type: 'switch', defaultValue: true },
      { key: 'block_without_plan', label: 'Bloquear sem plano', type: 'switch', defaultValue: true },
    ],
  },
  {
    value: 'signup_onboarding_payment_access',
    label: 'Cadastro + onboarding + pagamento',
    description: 'Cadastro, coleta de contexto, assinatura e depois acesso completo.',
    whenToUse: 'Bom quando o setup inicial aumenta ativacao e reduz suporte.',
    risk: 'Onboarding longo pode derrubar conclusao de cadastro.',
    recommendedMetric: 'onboarding_completed',
    redirect: '/auth?intent=onboarding',
    fields: [
      { key: 'required_steps', label: 'Etapas obrigatorias', type: 'number', defaultValue: 3, min: 1 },
      { key: 'require_whatsapp_setup', label: 'Exigir conexao WhatsApp', type: 'switch', defaultValue: false },
      { key: 'payment_after_onboarding', label: 'Pagamento depois do onboarding', type: 'switch', defaultValue: true },
    ],
  },
  {
    value: 'trial_auto',
    label: 'Trial automatico',
    description: 'A pessoa entra com teste gratis por um numero definido de dias.',
    whenToUse: 'Bom para provar valor dentro do produto antes da cobranca.',
    risk: 'Precisa controlar plano, limites e bloqueio ao vencer para nao gerar custo sem receita.',
    recommendedMetric: 'activation_completed',
    redirect: '/auth?intent=trial',
    fields: [
      { key: 'trial_days', label: 'Dias de trial', type: 'number', defaultValue: 7, min: 1, max: 60 },
      { key: 'plan_slug', label: 'Plano base do trial', type: 'text', defaultValue: 'pro' },
      { key: 'require_card', label: 'Exigir cartao', type: 'switch', defaultValue: false },
      { key: 'block_after_trial', label: 'Bloquear apos vencer', type: 'switch', defaultValue: true },
      { key: 'reminder_days_before_end', label: 'Avisar quantos dias antes', type: 'number', defaultValue: 2, min: 0 },
    ],
  },
  {
    value: 'trial_with_card',
    label: 'Trial com cartao',
    description: 'A pessoa informa pagamento, ganha trial e pode ser cobrada ao fim.',
    whenToUse: 'Bom para qualificar melhor o lead e reduzir abuso de trial.',
    risk: 'Maior friccao no inicio, mas tende a elevar qualidade dos usuarios.',
    recommendedMetric: 'payment_method_added',
    redirect: '/auth?intent=plans',
    fields: [
      { key: 'trial_days', label: 'Dias de trial', type: 'number', defaultValue: 7, min: 1, max: 60 },
      { key: 'plan_slug', label: 'Plano obrigatorio', type: 'text', defaultValue: 'pro' },
      { key: 'auto_charge_after_trial', label: 'Cobrar automaticamente ao fim', type: 'switch', defaultValue: true },
      { key: 'allow_cancel_before_charge', label: 'Permitir cancelar antes da cobranca', type: 'switch', defaultValue: true },
    ],
  },
  {
    value: 'manual_approval',
    label: 'Aprovacao manual',
    description: 'Cadastro fica pendente ate o admin aprovar.',
    whenToUse: 'Bom para B2B high-touch, beta fechado ou controle de qualidade.',
    risk: 'Demora na aprovacao pode matar intencao de compra.',
    recommendedMetric: 'admin_approved',
    redirect: '/auth?intent=approval',
    fields: [
      { key: 'notify_admin', label: 'Notificar admin', type: 'switch', defaultValue: true },
      { key: 'approval_sla_hours', label: 'SLA de aprovacao em horas', type: 'number', defaultValue: 24, min: 1 },
      { key: 'plan_slug_after_approval', label: 'Plano ao aprovar', type: 'text', defaultValue: 'pro' },
    ],
  },
  {
    value: 'freemium',
    label: 'Freemium',
    description: 'A pessoa acessa gratis com limites pequenos e faz upgrade dentro do app.',
    whenToUse: 'Bom para volume, produto simples de experimentar e upsell por uso.',
    risk: 'Sem limites firmes, pode gerar custo de storage, IA e WhatsApp sem receita.',
    recommendedMetric: 'upgrade_started',
    redirect: '/auth?intent=freemium',
    fields: [
      { key: 'max_messages_month', label: 'Mensagens por mes', type: 'number', defaultValue: 100, min: 0 },
      { key: 'storage_limit_mb', label: 'Storage em MB', type: 'number', defaultValue: 100, min: 0 },
      { key: 'max_users', label: 'Usuarios', type: 'number', defaultValue: 1, min: 1 },
      { key: 'max_whatsapp_instances', label: 'Instancias WhatsApp', type: 'number', defaultValue: 1, min: 0 },
      { key: 'upgrade_trigger_percent', label: 'Mostrar upgrade com uso %', type: 'number', defaultValue: 80, min: 1, max: 100 },
    ],
  },
  {
    value: 'demo_first',
    label: 'Demo primeiro',
    description: 'CTA leva para video, demonstracao ou agendamento antes do cadastro.',
    whenToUse: 'Bom quando o produto precisa de contexto para converter.',
    risk: 'Se a demo nao tiver CTA forte, o usuario pode assistir e sair.',
    recommendedMetric: 'demo_watched',
    redirect: '/landing#video',
    fields: [
      { key: 'demo_url', label: 'URL da demo', type: 'text', defaultValue: '/landing#video' },
      { key: 'require_email_to_watch', label: 'Exigir email para assistir', type: 'switch', defaultValue: false },
      { key: 'show_calendar', label: 'Mostrar calendario', type: 'switch', defaultValue: false },
    ],
  },
  {
    value: 'onboarding_before_signup',
    label: 'Onboarding antes do cadastro',
    description: 'Coleta necessidade e contexto antes de criar a conta.',
    whenToUse: 'Bom para personalizar proposta e qualificar lead antes de abrir conta.',
    risk: 'Se pedir informacao demais, reduz o numero de cadastros.',
    recommendedMetric: 'signup_completed',
    redirect: '/auth?intent=onboarding',
    fields: [
      { key: 'questions_before_signup', label: 'Perguntas antes do cadastro', type: 'number', defaultValue: 3, min: 1 },
      { key: 'require_phone', label: 'Exigir telefone', type: 'switch', defaultValue: true },
      { key: 'send_lead_to_crm', label: 'Enviar lead para CRM', type: 'switch', defaultValue: true },
    ],
  },
  {
    value: 'access_limited_payment',
    label: 'Acesso limitado + pagamento',
    description: 'A pessoa entra com acesso restrito e encontra upgrade no produto.',
    whenToUse: 'Bom para demonstrar valor rapido antes de pedir pagamento.',
    risk: 'Acesso aberto demais pode consumir recursos; restrito demais pode nao mostrar valor.',
    recommendedMetric: 'payment_completed',
    redirect: '/auth?intent=limited',
    fields: [
      { key: 'limited_access_days', label: 'Dias de acesso limitado', type: 'number', defaultValue: 3, min: 1 },
      { key: 'allowed_modules', label: 'Modulos liberados', type: 'text', defaultValue: 'dashboard,profile,plans' },
      { key: 'show_upgrade_banner', label: 'Mostrar banner de upgrade', type: 'switch', defaultValue: true },
    ],
  },
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
  'payment_method_added',
  'upgrade_started',
  'admin_approved',
  'demo_watched',
];

function getFlow(value: string) {
  return FLOW_OPTIONS.find((item) => item.value === value) || FLOW_OPTIONS[1];
}

function getFlowLabel(value: string) {
  return getFlow(value).label;
}

function defaultFlowConfig(flowType: EntryFlowType) {
  const flow = getFlow(flowType);
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
    description: 'Comparar cadastro direto contra trial para descobrir qual formato gera mais ativacao e pagamento.',
    status,
    primary_metric: 'payment_completed',
    variants: [
      defaultVariant('A - Cadastro primeiro', 'signup_first_payment_after', 50),
      defaultVariant('B - Trial automatico', 'trial_auto', 50),
    ],
  };
}

export default function AdminGrowthPage() {
  const { data, isLoading } = useEntryFlows();
  const updateSettings = useUpdateEntryFlowSettings();
  const saveExperiment = useSaveEntryFlowExperiment();
  const deleteExperiment = useDeleteEntryFlowExperiment();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<EntryFlowExperimentInput>(suggestedExperiment());

  const settings = data?.settings || {};
  const experiments = data?.experiments || [];
  const activeExperiment = experiments.find((experiment: any) => experiment.status === 'active');
  const totalAssigned = activeExperiment?.metrics?.variant_assigned || 0;

  const settingsDraft = useMemo(() => ({
    ab_testing_enabled: settings.ab_testing_enabled === true,
    default_flow_type: (settings.default_flow_type || 'signup_first_payment_after') as EntryFlowType,
    default_redirect: settings.default_redirect || '/auth',
    persist_assignment_days: Number(settings.persist_assignment_days || 30),
    flow_configs: settings.flow_configs || {},
  }), [settings]);

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
      variants: (experiment.variants || []).map((variant: any) => ({
        id: variant.id,
        name: variant.name,
        flow_type: variant.flow_type,
        traffic_percent: variant.traffic_percent,
        is_control: variant.is_control,
        config: { ...defaultFlowConfig(variant.flow_type), ...(variant.config || {}) },
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
          <Button onClick={() => openNew()} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo experimento
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard icon={<Route className="h-4 w-4" />} title="Fluxo padrao" loading={isLoading} value={getFlowLabel(settingsDraft.default_flow_type)} hint="Usado quando nao ha experimento ativo." />
          <SummaryCard icon={<FlaskConical className="h-4 w-4" />} title="Experimento ativo" loading={isLoading} value={activeExperiment?.name || 'Nenhum'} hint={`A/B testing ${settingsDraft.ab_testing_enabled ? 'ligado' : 'desligado'}.`} />
          <SummaryCard icon={<MousePointerClick className="h-4 w-4" />} title="Visitantes sorteados" loading={isLoading} value={String(totalAssigned)} hint="Evento variant_assigned no experimento ativo." />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Configuracao global</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-36 w-full" />
            ) : (
              <GlobalSettingsForm
                initial={settingsDraft}
                hasActiveExperiment={Boolean(activeExperiment)}
                onNeedsExperiment={() => openNew('active')}
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
                    variants: [...current.variants, defaultVariant(`Variacao ${current.variants.length + 1}`, 'signup_first_payment_after', 0)],
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
    ...(draft.flow_configs?.[draft.default_flow_type] || {}),
    redirect_path: draft.default_redirect,
  };

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const updateSelectedConfig = (key: string, value: any) => {
    setDraft((current) => {
      const nextConfig = {
        ...defaultFlowConfig(current.default_flow_type),
        ...(current.flow_configs?.[current.default_flow_type] || {}),
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
              default_redirect: current.flow_configs?.[flowType]?.redirect_path || flow.redirect,
              flow_configs: {
                ...(current.flow_configs || {}),
                [flowType]: {
                  ...defaultFlowConfig(flowType),
                  ...(current.flow_configs?.[flowType] || {}),
                  redirect_path: current.flow_configs?.[flowType]?.redirect_path || flow.redirect,
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
