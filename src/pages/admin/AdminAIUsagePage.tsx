import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminAIUsage, useUpdateAdminAIUsageSettings, type AdminAIUsageMode } from '@/hooks/useAdminDashboard';
import { Activity, BrainCircuit, CalendarRange, Key, Save, Sparkles } from 'lucide-react';

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateInput(date);
}

function formatNumber(value?: number | null) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatPercent(value?: number | null) {
  if (value === null || value === undefined) return '-';
  return `${value}%`;
}

function formatCurrency(value?: number | null) {
  return `US$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PRESETS = [
  { label: 'Hoje', range: () => ({ from: dateDaysAgo(0), to: dateDaysAgo(0) }) },
  { label: 'Ontem', range: () => ({ from: dateDaysAgo(1), to: dateDaysAgo(1) }) },
  { label: 'Ultimos 7 dias', range: () => ({ from: dateDaysAgo(6), to: dateDaysAgo(0) }) },
  { label: 'Ultimos 30 dias', range: () => ({ from: dateDaysAgo(29), to: dateDaysAgo(0) }) },
  {
    label: 'Este mes',
    range: () => {
      const now = new Date();
      return { from: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)), to: dateDaysAgo(0) };
    },
  },
];

export default function AdminAIUsagePage() {
  const [dateFrom, setDateFrom] = useState(dateDaysAgo(6));
  const [dateTo, setDateTo] = useState(dateDaysAgo(0));
  const [aiMode, setAiMode] = useState<AdminAIUsageMode>('all');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiAdminKey, setOpenaiAdminKey] = useState('');
  const [wizzyBudget, setWizzyBudget] = useState('0');
  const [alertThreshold, setAlertThreshold] = useState('80');

  const filters = useMemo(() => ({
    date_from: dateFrom,
    date_to: dateTo,
    ai_mode: aiMode,
  }), [dateFrom, dateTo, aiMode]);

  const { data, isLoading } = useAdminAIUsage(filters);
  const updateSettings = useUpdateAdminAIUsageSettings();
  const summary = data?.summary || {};
  const settings = data?.settings || {};
  const organizations = data?.organizations || [];
  const daily = data?.daily || [];

  useEffect(() => {
    if (!settings) return;
    setOpenaiApiKey(settings.openai_api_key_masked || '');
    setOpenaiAdminKey(settings.openai_admin_key_masked || '');
    setWizzyBudget(String(settings.wizzy_ai_monthly_budget_usd ?? 0));
    setAlertThreshold(String(settings.alert_threshold_percent ?? 80));
  }, [settings.openai_api_key_masked, settings.openai_admin_key_masked, settings.wizzy_ai_monthly_budget_usd, settings.alert_threshold_percent]);

  const saveSettings = () => {
    updateSettings.mutate({
      openai_api_key: openaiApiKey,
      openai_admin_key: openaiAdminKey,
      wizzy_ai_monthly_budget_usd: Number(wizzyBudget || 0),
      alert_threshold_percent: Number(alertThreshold || 80),
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Consumo IA</h1>
            <p className="mt-1 text-muted-foreground">
              Uso por cliente, plano, API propria e Wizzy AI.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = preset.range();
                  setDateFrom(next.from);
                  setDateTo(next.to);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_180px]">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">De</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Ate</span>
              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Tipo IA</span>
              <select
                value={aiMode}
                onChange={(event) => setAiMode(event.target.value as AdminAIUsageMode)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">Todos</option>
                <option value="own_api">API propria</option>
                <option value="platform_api">Wizzy AI</option>
              </select>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-5 w-5 text-primary" />
              Wizzy AI
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_160px_auto] lg:items-end">
              <div className="space-y-2">
                <Label>OpenAI API Key da Wizzy</Label>
                <Input
                  type="password"
                  value={openaiApiKey}
                  onChange={(event) => setOpenaiApiKey(event.target.value)}
                  placeholder="sk-proj-..."
                />
              </div>
              <div className="space-y-2">
                <Label>OpenAI Admin Key</Label>
                <Input
                  type="password"
                  value={openaiAdminKey}
                  onChange={(event) => setOpenaiAdminKey(event.target.value)}
                  placeholder="sk-admin-..."
                />
              </div>
              <div className="space-y-2">
                <Label>Orcamento mensal (US$)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={wizzyBudget}
                  onChange={(event) => setWizzyBudget(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Alerta (%)</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={alertThreshold}
                  onChange={(event) => setAlertThreshold(event.target.value)}
                />
              </div>
              <Button onClick={saveSettings} disabled={updateSettings.isPending} className="gap-2">
                <Save className="h-4 w-4" />
                {updateSettings.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">API Key Wizzy</p>
                <p className="mt-1 font-medium">{settings.openai_api_key_configured ? 'Configurada' : 'Nao configurada'}</p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Admin Key</p>
                <p className="mt-1 font-medium">{settings.openai_admin_key_configured ? 'Configurada' : 'Nao configurada'}</p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Custo real OpenAI no periodo</p>
                <p className="mt-1 font-medium">{formatCurrency(summary.wizzy_ai_real_cost_usd)}</p>
              </div>
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Uso do orcamento</p>
                <p className="mt-1 font-medium">{formatPercent(summary.wizzy_ai_budget_usage_percent)}</p>
              </div>
            </div>

            {settings.openai_costs?.configured && settings.openai_costs?.available === false && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700">
                Nao foi possivel consultar a OpenAI: {settings.openai_costs?.error || 'verifique a Admin Key'}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Activity className="h-4 w-4 text-primary" />
                Requisicoes no periodo
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-9 w-28" /> : <p className="text-3xl font-bold">{formatNumber(summary.total_requests)}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" />
                Wizzy AI
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-9 w-28" /> : <p className="text-3xl font-bold">{formatNumber(summary.wizzy_ai_requests)}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{formatNumber(summary.wizzy_ai_organizations)} clientes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Key className="h-4 w-4 text-primary" />
                API propria
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-9 w-28" /> : <p className="text-3xl font-bold">{formatNumber(summary.own_api_requests)}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{formatNumber(summary.own_api_organizations)} clientes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <BrainCircuit className="h-4 w-4 text-primary" />
                Uso mensal
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-9 w-28" />
              ) : (
                <p className="text-3xl font-bold">{formatNumber(summary.total_monthly_used)}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                de {formatNumber(summary.total_monthly_limit)} requisicoes configuradas
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BrainCircuit className="h-5 w-5 text-primary" />
              Consumo por cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-6">
                {[1, 2, 3].map((item) => <Skeleton key={item} className="h-10 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Periodo</TableHead>
                    <TableHead className="text-right">Mensal</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Uso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizations.map((item: any) => (
                    <TableRow key={item.organization_id}>
                      <TableCell className="font-medium">{item.organization_name}</TableCell>
                      <TableCell>{item.plan_name}</TableCell>
                      <TableCell>
                        <Badge variant={item.ai_mode === 'platform_api' ? 'default' : 'secondary'}>
                          {item.api_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(item.period_requests)}</TableCell>
                      <TableCell className="text-right">
                        {formatNumber(item.monthly_used)}
                        {item.monthly_limit ? ` / ${formatNumber(item.monthly_limit)}` : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.monthly_remaining === null ? '-' : formatNumber(item.monthly_remaining)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={Number(item.monthly_usage_percent || 0) >= 80 ? 'font-medium text-amber-600' : ''}>
                          {formatPercent(item.monthly_usage_percent)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {organizations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        Nenhum consumo encontrado para os filtros selecionados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarRange className="h-5 w-5 text-primary" />
              Consumo diario
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Wizzy AI</TableHead>
                  <TableHead className="text-right">API propria</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {daily.map((item: any) => (
                  <TableRow key={item.date}>
                    <TableCell>{item.date}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.total_requests)}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.wizzy_ai_requests)}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.own_api_requests)}</TableCell>
                  </TableRow>
                ))}
                {!isLoading && daily.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      Sem requisicoes no periodo.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
